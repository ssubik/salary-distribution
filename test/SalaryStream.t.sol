// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.35;

import {Test} from "forge-std/Test.sol";
import {SalaryStream} from "../src/SalaryStream.sol";

contract SalaryStreamTest is Test {
    SalaryStream internal salaryStream;

    function setUp() public {
        salaryStream = new SalaryStream();
    }

    function test_RegisterEmployeeReturnsDeterministicAddress() public {
        SalaryStream.EmployeeDetails memory employee =
            SalaryStream.EmployeeDetails({id: 1, age: 30, name: "Alice", position: "Engineer"});

        address expected = address(uint160(uint256(keccak256(abi.encode(employee)))));

        assertEq(salaryStream.registerEmployee(employee), expected);
    }

    function test_RevertWhenStreamingMoreThanMaxEmployees() public {
        address[] memory employees = new address[](11);

        vm.expectRevert();
        salaryStream.claimOrStreamSalary(employees);
    }
}
