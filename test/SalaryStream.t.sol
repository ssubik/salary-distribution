// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SalaryStream} from "../src/SalaryStream.sol";

contract MockSalaryToken is ERC20 {
    constructor() ERC20("Salary Token", "SAL") {}

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }
}

contract SalaryStreamTest is Test {
    uint256 internal constant FUNDS = 100_000 ether;
    uint256 internal constant SALARY = 3_000 ether;

    MockSalaryToken internal token;
    SalaryStream internal salaryStream;

    address internal employee = makeAddr("employee");
    address internal secondEmployee = makeAddr("secondEmployee");
    address internal stranger = makeAddr("stranger");
    address internal treasury = makeAddr("treasury");

    function setUp() public {
        vm.warp(1_000_000);
        token = new MockSalaryToken();
        salaryStream = new SalaryStream(IERC20(address(token)), address(this));

        token.mint(address(this), FUNDS);
        token.approve(address(salaryStream), FUNDS);
        salaryStream.fund(FUNDS);
        _register(employee, 1, "Alice");
    }

    function test_FundTracksReceivedTokens() public view {
        assertEq(token.balanceOf(address(salaryStream)), FUNDS);
        assertEq(salaryStream.availableBalance(), FUNDS);
    }

    function test_OnlyOwnerCanRegisterAndConfigureEmployees() public {
        SalaryStream.EmployeeDetails memory details = _employeeDetails(2, "Bob");

        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        salaryStream.registerEmployee(secondEmployee, details);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        salaryStream.configureEmployeeSalary(employee, SALARY, SalaryStream.Intervals.OneMonth);
        vm.stopPrank();
    }

    function test_RegisterAndUpdateEmployee() public {
        SalaryStream.EmployeeDetails memory updated =
            SalaryStream.EmployeeDetails({id: 2, age: 31, name: "Alice Smith", position: "Lead Engineer"});

        salaryStream.updateEmployee(employee, updated);

        (uint64 id, uint64 age, string memory name, string memory position) = salaryStream.employeeDetails(employee);
        assertEq(id, 2);
        assertEq(age, 31);
        assertEq(name, "Alice Smith");
        assertEq(position, "Lead Engineer");
        assertEq(salaryStream.employeeById(1), address(0));
        assertEq(salaryStream.employeeById(2), employee);
    }

    function test_RevertWhenEmployeeOrIdIsAlreadyRegistered() public {
        vm.expectRevert(abi.encodeWithSelector(SalaryStream.EmployeeAlreadyRegistered.selector, employee));
        salaryStream.registerEmployee(employee, _employeeDetails(2, "Duplicate"));

        vm.expectRevert(abi.encodeWithSelector(SalaryStream.EmployeeIdAlreadyRegistered.selector, 1));
        salaryStream.registerEmployee(secondEmployee, _employeeDetails(1, "Duplicate ID"));
    }

    function test_ConfigureSalaryReservesFunds() public {
        salaryStream.configureEmployeeSalary(employee, SALARY, SalaryStream.Intervals.OneMonth);

        (uint256 totalSalary, uint256 claimedSalary, uint64 startedAt, uint64 streamTill, uint64 interval) =
            salaryStream.employeeSalaryConfig(employee);

        assertEq(totalSalary, SALARY);
        assertEq(claimedSalary, 0);
        assertEq(startedAt, block.timestamp);
        assertEq(interval, 30 days);
        assertEq(streamTill, block.timestamp + 30 days);
        assertEq(salaryStream.totalReserved(), SALARY);
        assertEq(salaryStream.availableBalance(), FUNDS - SALARY);
    }

    function test_SalaryVestsProportionallyAndCanBeClaimedInParts() public {
        salaryStream.configureEmployeeSalary(employee, SALARY, SalaryStream.Intervals.OneMonth);

        vm.warp(block.timestamp + 10 days);
        assertEq(salaryStream.claimableSalary(employee), 1_000 ether);

        vm.prank(employee);
        assertEq(salaryStream.claimSalary(), 1_000 ether);
        assertEq(token.balanceOf(employee), 1_000 ether);
        assertEq(salaryStream.totalReserved(), 2_000 ether);

        vm.warp(block.timestamp + 20 days);
        vm.prank(employee);
        assertEq(salaryStream.claimSalary(), 2_000 ether);

        assertEq(token.balanceOf(employee), SALARY);
        assertEq(salaryStream.totalReserved(), 0);
        assertEq(salaryStream.outstandingSalary(employee), 0);
    }

    function test_EndOfStreamPaysFullSalaryWithoutRoundingLoss() public {
        uint256 unevenSalary = 100 ether + 1;
        salaryStream.configureEmployeeSalary(employee, unevenSalary, SalaryStream.Intervals.OneDay);

        vm.warp(block.timestamp + 1 days);
        vm.prank(employee);
        salaryStream.claimSalary();

        assertEq(token.balanceOf(employee), unevenSalary);
        assertEq(salaryStream.totalReserved(), 0);
    }

    function test_AnyoneCanTriggerBatchPaymentsToEmployees() public {
        _register(secondEmployee, 2, "Bob");
        salaryStream.configureEmployeeSalary(employee, SALARY, SalaryStream.Intervals.OneDay);
        salaryStream.configureEmployeeSalary(secondEmployee, 1_000 ether, SalaryStream.Intervals.OneDay);
        vm.warp(block.timestamp + 1 days);

        address[] memory employees = new address[](2);
        employees[0] = employee;
        employees[1] = secondEmployee;

        vm.prank(stranger);
        salaryStream.claimOrStreamSalary(employees);

        assertEq(token.balanceOf(employee), SALARY);
        assertEq(token.balanceOf(secondEmployee), 1_000 ether);
    }

    function test_RevertWhenBatchExceedsMaximum() public {
        address[] memory employees = new address[](11);

        vm.expectRevert(abi.encodeWithSelector(SalaryStream.TooManyEmployees.selector, 11, 10));
        salaryStream.claimOrStreamSalary(employees);
    }

    function test_PauseBlocksClaimsUntilUnpaused() public {
        salaryStream.configureEmployeeSalary(employee, SALARY, SalaryStream.Intervals.OneDay);
        vm.warp(block.timestamp + 1 days);
        salaryStream.pause();

        vm.prank(employee);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        salaryStream.claimSalary();

        salaryStream.unpause();
        vm.prank(employee);
        salaryStream.claimSalary();
        assertEq(token.balanceOf(employee), SALARY);
    }

    function test_CancelPreservesVestedSalaryAndReleasesTheRest() public {
        salaryStream.configureEmployeeSalary(employee, SALARY, SalaryStream.Intervals.OneMonth);
        vm.warp(block.timestamp + 10 days);

        salaryStream.cancelSalaryStream(employee);

        assertEq(salaryStream.claimableSalary(employee), 1_000 ether);
        assertEq(salaryStream.outstandingSalary(employee), 1_000 ether);
        assertEq(salaryStream.totalReserved(), 1_000 ether);
        assertEq(salaryStream.availableBalance(), FUNDS - 1_000 ether);

        vm.prank(employee);
        salaryStream.claimSalary();
        assertEq(token.balanceOf(employee), 1_000 ether);
    }

    function test_SweepCannotWithdrawReservedSalary() public {
        salaryStream.configureEmployeeSalary(employee, SALARY, SalaryStream.Intervals.OneMonth);

        vm.expectRevert(
            abi.encodeWithSelector(
                SalaryStream.InsufficientAvailableBalance.selector, FUNDS - SALARY, FUNDS - SALARY + 1
            )
        );
        salaryStream.sweep(treasury, FUNDS - SALARY + 1);

        salaryStream.sweep(treasury, FUNDS - SALARY);
        assertEq(token.balanceOf(treasury), FUNDS - SALARY);
        assertEq(token.balanceOf(address(salaryStream)), SALARY);
    }

    function test_ReconfigureOnlyAfterPreviousSalaryIsFullyClaimed() public {
        salaryStream.configureEmployeeSalary(employee, SALARY, SalaryStream.Intervals.OneDay);

        vm.expectRevert(abi.encodeWithSelector(SalaryStream.OutstandingSalary.selector, employee, SALARY));
        salaryStream.configureEmployeeSalary(employee, 1_000 ether, SalaryStream.Intervals.OneWeek);

        vm.warp(block.timestamp + 1 days);
        vm.prank(employee);
        salaryStream.claimSalary();

        salaryStream.configureEmployeeSalary(employee, 1_000 ether, SalaryStream.Intervals.OneWeek);
        assertEq(salaryStream.outstandingSalary(employee), 1_000 ether);
    }

    function test_UnregisterRequiresNoOutstandingSalary() public {
        salaryStream.configureEmployeeSalary(employee, SALARY, SalaryStream.Intervals.OneDay);

        vm.expectRevert(abi.encodeWithSelector(SalaryStream.OutstandingSalary.selector, employee, SALARY));
        salaryStream.unregisterEmployee(employee);

        salaryStream.cancelSalaryStream(employee);
        salaryStream.unregisterEmployee(employee);

        assertFalse(salaryStream.isRegistered(employee));
        assertEq(salaryStream.employeeById(1), address(0));
    }

    function test_RevertWhenContractIsUnderfunded() public {
        salaryStream.sweep(treasury, FUNDS);

        vm.expectRevert(abi.encodeWithSelector(SalaryStream.InsufficientAvailableBalance.selector, 0, SALARY));
        salaryStream.configureEmployeeSalary(employee, SALARY, SalaryStream.Intervals.OneDay);
    }

    function _register(address account, uint64 id, string memory name) internal {
        salaryStream.registerEmployee(account, _employeeDetails(id, name));
    }

    function _employeeDetails(uint64 id, string memory name)
        internal
        pure
        returns (SalaryStream.EmployeeDetails memory)
    {
        return SalaryStream.EmployeeDetails({id: id, age: 30, name: name, position: "Engineer"});
    }
}
