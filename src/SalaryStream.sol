pragma solidity ^0.8.35;

// invariants
// balance of employee must incresase proportionally to the time period it has been streamed
// the time for which a employee can claim his salary must be less than Interval
// TODO deposit erc20 to stream
// TODO emit events
// TODO actual stream
// TODO authorization
// TODO sweep
// TODO Emergency pause
contract SalaryStream {
    uint64 immutable MAX_EMPLOYEES = 10;

    uint64 immutable ONE_DAY = 1 days;
    uint64 immutable ONE_WEEK = 1 weeks;
    uint64 immutable ONE_MONTH = 30 days;

    enum Intervals {
        oneDay,
        oneWeek,
        oneMonth
    }

    mapping(address employee => EmployeeSalaryConfiguration) employeeSalaryConfig;
    mapping(address employee => EmployeeDetails) employeeDetails;
    mapping(address employee => uint256) employeeSalary;

    struct EmployeeSalaryConfiguration {
        uint64 streamTill;
        uint64 lastStreamed;
        uint64 interval;
    }

    struct EmployeeDetails {
        uint64 id;
        uint64 age;
        string name;
        string position;
    }

    function registerEmployee(EmployeeDetails calldata employee) external returns (address) {
        address registeredEmployee = address(uint160(uint256(keccak256(abi.encode(employee)))));

        employeeDetails[registeredEmployee] = employee;
        return registeredEmployee;
    }

    function configureEmployeeSalary(address employee, uint256 salary, Intervals interval) external {
        employeeSalary[employee] = salary;
        EmployeeSalaryConfiguration memory salaryConfig = employeeSalaryConfig[employee];

        if (interval == Intervals.oneDay) {
            salaryConfig.interval = ONE_DAY;
        } else if (interval == Intervals.oneWeek) {
            salaryConfig.interval = ONE_WEEK;
        } else if (interval == Intervals.oneMonth) {
            salaryConfig.interval = ONE_MONTH;
        } else {
            revert();
        }

        salaryConfig.streamTill = uint64(block.timestamp) + uint64(interval);
        salaryConfig.lastStreamed = uint64(block.timestamp);
    }

    function claimOrStreamSalary(address[] memory employees) external {
        require(employees.length <= MAX_EMPLOYEES);
        uint256 employeesLen = employees.length;

        for (uint256 i; i < employeesLen; ++i) {
            _claimOrStreamSalary(employees[i]);
        }
    }

    function _claimOrStreamSalary(address employee) private {
        EmployeeSalaryConfiguration memory salaryConfig = employeeSalaryConfig[employee];
        uint256 salary = employeeSalary[employee];
        uint256 periodToStream = block.timestamp - salaryConfig.lastStreamed;
        uint256 amountToStream = salary * (periodToStream / salaryConfig.interval);

        // SafeERC20.transfer();
    }
}
