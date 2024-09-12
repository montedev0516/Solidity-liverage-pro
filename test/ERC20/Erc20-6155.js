const utils = require("./utils/OpenLevUtil");
const {
    toWei,
    last8,
    prettyPrintBalance,
    checkAmount,
    printBlockNum,
    wait,
    assertPrint,
    Uni2DexData,
    addressToBytes,
    step,
    resetStep, assertThrows
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocksAndTime, toBN, advanceBlockAndSetTime} = require("./utils/EtheUtil");
const m = require('mocha-logger');
const TestToken = artifacts.require("MockERC20");
const XOLEDelegator = artifacts.require("XOLEDelegator");
const MockUniswapV2Pair = artifacts.require("MockUniswapV2Pair");

const timeMachine = require('ganache-time-traveler');