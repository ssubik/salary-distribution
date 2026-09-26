// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title SalaryStream
/// @notice Streams a funded ERC-20 salary to registered employees over a fixed interval.
/// @dev Each configured salary is fully reserved until it is claimed or its unvested portion is cancelled.
contract SalaryStream is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_EMPLOYEES_PER_BATCH = 10;
    uint64 public constant ONE_DAY = 1 days;
    uint64 public constant ONE_WEEK = 1 weeks;
    uint64 public constant ONE_MONTH = 30 days;

    IERC20 public immutable salaryToken;
    uint256 public totalReserved;

    enum Intervals {
        OneDay,
        OneWeek,
        OneMonth
    }

    struct EmployeeSalaryConfiguration {
        uint256 totalSalary;
        uint256 claimedSalary;
        uint64 startedAt;
        uint64 streamTill;
        uint64 interval;
    }

    struct EmployeeDetails {
        uint64 id;
        uint64 age;
        string name;
        string position;
    }

    mapping(address employee => EmployeeSalaryConfiguration configuration) public employeeSalaryConfig;
    mapping(address employee => EmployeeDetails details) public employeeDetails;
    mapping(address employee => bool registered) public isRegistered;
    mapping(uint64 employeeId => address employee) public employeeById;

    error AddressZero();
    error AmountZero();
    error EmployeeAlreadyRegistered(address employee);
    error EmployeeIdAlreadyRegistered(uint64 employeeId);
    error EmployeeNotRegistered(address employee);
    error InsufficientAvailableBalance(uint256 available, uint256 required);
    error InvalidEmployeeId();
    error NoSalaryToClaim(address employee);
    error NoStream(address employee);
    error OutstandingSalary(address employee, uint256 amount);
    error StreamAlreadyEnded(address employee);
    error TooManyEmployees(uint256 supplied, uint256 maximum);

    event ContractFunded(address indexed funder, uint256 amount);
    event EmployeeRegistered(address indexed employee, uint64 indexed employeeId, string name, string position);
    event EmployeeUpdated(address indexed employee, uint64 indexed employeeId, string name, string position);
    event EmployeeUnregistered(address indexed employee, uint64 indexed employeeId);
    event SalaryStreamConfigured(
        address indexed employee, uint256 salary, uint64 indexed startedAt, uint64 indexed streamTill
    );
    event SalaryClaimed(address indexed employee, uint256 amount);
    event SalaryStreamCancelled(address indexed employee, uint256 vestedSalary, uint256 releasedSalary);
    event ExcessSwept(address indexed recipient, uint256 amount);

    constructor(IERC20 token, address initialOwner) Ownable(initialOwner) {
        if (address(token) == address(0)) revert AddressZero();
        salaryToken = token;
    }

    /// @notice Deposits salary tokens into the contract.
    /// @dev The received balance delta is emitted to support fee-on-transfer deposits.
    function fund(uint256 amount) external nonReentrant returns (uint256 received) {
        if (amount == 0) revert AmountZero();

        uint256 balanceBefore = salaryToken.balanceOf(address(this));
        salaryToken.safeTransferFrom(msg.sender, address(this), amount);
        received = salaryToken.balanceOf(address(this)) - balanceBefore;

        if (received == 0) revert AmountZero();
        emit ContractFunded(msg.sender, received);
    }

    function registerEmployee(address employee, EmployeeDetails calldata details) external onlyOwner {
        if (employee == address(0)) revert AddressZero();
        if (details.id == 0) revert InvalidEmployeeId();
        if (isRegistered[employee]) revert EmployeeAlreadyRegistered(employee);
        if (employeeById[details.id] != address(0)) revert EmployeeIdAlreadyRegistered(details.id);

        isRegistered[employee] = true;
        employeeById[details.id] = employee;
        employeeDetails[employee] = details;

        emit EmployeeRegistered(employee, details.id, details.name, details.position);
    }

    function updateEmployee(address employee, EmployeeDetails calldata details) external onlyOwner {
        _requireRegistered(employee);
        if (details.id == 0) revert InvalidEmployeeId();

        EmployeeDetails storage currentDetails = employeeDetails[employee];
        if (details.id != currentDetails.id) {
            if (employeeById[details.id] != address(0)) revert EmployeeIdAlreadyRegistered(details.id);
            delete employeeById[currentDetails.id];
            employeeById[details.id] = employee;
        }

        employeeDetails[employee] = details;
        emit EmployeeUpdated(employee, details.id, details.name, details.position);
    }

    function unregisterEmployee(address employee) external onlyOwner {
        _requireRegistered(employee);

        uint256 outstanding = outstandingSalary(employee);
        if (outstanding != 0) revert OutstandingSalary(employee, outstanding);

        uint64 employeeId = employeeDetails[employee].id;
        delete employeeById[employeeId];
        delete employeeDetails[employee];
        delete employeeSalaryConfig[employee];
        delete isRegistered[employee];

        emit EmployeeUnregistered(employee, employeeId);
    }

    /// @notice Creates one fully funded salary stream for a registered employee.
    /// @param salary The total token amount that will vest over the selected interval.
    function configureEmployeeSalary(address employee, uint256 salary, Intervals interval) external onlyOwner {
        _requireRegistered(employee);
        if (salary == 0) revert AmountZero();

        uint256 outstanding = outstandingSalary(employee);
        if (outstanding != 0) revert OutstandingSalary(employee, outstanding);

        uint256 available = availableBalance();
        if (available < salary) revert InsufficientAvailableBalance(available, salary);

        uint64 duration = intervalDuration(interval);
        uint64 startedAt = uint64(block.timestamp);
        uint64 streamTill = startedAt + duration;

        employeeSalaryConfig[employee] = EmployeeSalaryConfiguration({
            totalSalary: salary, claimedSalary: 0, startedAt: startedAt, streamTill: streamTill, interval: duration
        });
        totalReserved += salary;

        emit SalaryStreamConfigured(employee, salary, startedAt, streamTill);
    }

    /// @notice Claims the caller's currently vested salary.
    function claimSalary() external whenNotPaused nonReentrant returns (uint256 amount) {
        amount = _claimSalary(msg.sender);
    }

    /// @notice Pays vested salary to as many as ten employees. Anyone may trigger the payout.
    function claimOrStreamSalary(address[] calldata employees) external whenNotPaused nonReentrant {
        uint256 length = employees.length;
        if (length > MAX_EMPLOYEES_PER_BATCH) revert TooManyEmployees(length, MAX_EMPLOYEES_PER_BATCH);

        for (uint256 i; i < length; ++i) {
            _claimSalary(employees[i]);
        }
    }

    /// @notice Stops future vesting while preserving salary vested up to the current timestamp.
    function cancelSalaryStream(address employee) external onlyOwner {
        _requireRegistered(employee);
        EmployeeSalaryConfiguration storage configuration = employeeSalaryConfig[employee];
        if (configuration.totalSalary == 0 || configuration.totalSalary == configuration.claimedSalary) {
            revert NoStream(employee);
        }
        if (block.timestamp >= configuration.streamTill) revert StreamAlreadyEnded(employee);

        uint256 vestedSalary = _vestedSalary(configuration);
        uint256 releasedSalary = configuration.totalSalary - vestedSalary;
        totalReserved -= releasedSalary;

        if (vestedSalary == 0) {
            delete employeeSalaryConfig[employee];
        } else {
            uint64 cancelledAt = uint64(block.timestamp);
            configuration.totalSalary = vestedSalary;
            configuration.streamTill = cancelledAt;
            configuration.interval = cancelledAt - configuration.startedAt;
        }

        emit SalaryStreamCancelled(employee, vestedSalary, releasedSalary);
    }

    /// @notice Withdraws funds that are not reserved for employee streams.
    function sweep(address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert AddressZero();
        if (amount == 0) revert AmountZero();

        uint256 available = availableBalance();
        if (available < amount) revert InsufficientAvailableBalance(available, amount);

        salaryToken.safeTransfer(recipient, amount);
        emit ExcessSwept(recipient, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function claimableSalary(address employee) public view returns (uint256) {
        EmployeeSalaryConfiguration storage configuration = employeeSalaryConfig[employee];
        return _vestedSalary(configuration) - configuration.claimedSalary;
    }

    function outstandingSalary(address employee) public view returns (uint256) {
        EmployeeSalaryConfiguration storage configuration = employeeSalaryConfig[employee];
        return configuration.totalSalary - configuration.claimedSalary;
    }

    function availableBalance() public view returns (uint256) {
        uint256 balance = salaryToken.balanceOf(address(this));
        return balance > totalReserved ? balance - totalReserved : 0;
    }

    function intervalDuration(Intervals interval) public pure returns (uint64) {
        if (interval == Intervals.OneDay) return ONE_DAY;
        if (interval == Intervals.OneWeek) return ONE_WEEK;
        return ONE_MONTH;
    }

    function _claimSalary(address employee) private returns (uint256 amount) {
        _requireRegistered(employee);
        amount = claimableSalary(employee);
        if (amount == 0) revert NoSalaryToClaim(employee);

        EmployeeSalaryConfiguration storage configuration = employeeSalaryConfig[employee];
        configuration.claimedSalary += amount;
        totalReserved -= amount;

        salaryToken.safeTransfer(employee, amount);
        emit SalaryClaimed(employee, amount);
    }

    function _vestedSalary(EmployeeSalaryConfiguration storage configuration) private view returns (uint256) {
        if (configuration.totalSalary == 0 || block.timestamp <= configuration.startedAt) return 0;
        if (block.timestamp >= configuration.streamTill) return configuration.totalSalary;

        uint256 elapsed = block.timestamp - configuration.startedAt;
        return Math.mulDiv(configuration.totalSalary, elapsed, configuration.interval);
    }

    function _requireRegistered(address employee) private view {
        if (!isRegistered[employee]) revert EmployeeNotRegistered(employee);
    }
}
