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

contract("XOLE", async accounts => {

    // components
    let xole;
    let ole;
    let dai;
    let usdt;
    let uniswapFactory;

    let H = 3600;
    let DAY = 86400;
    let WEEK = 7 * DAY;
    let MAXTIME = 126144000;
    let TOL = 120 / WEEK;

    // roles
    let admin = accounts[0];
    let john = accounts[1];
    let tom = accounts[2];
    let dev = accounts[7];
    let communityAcc = accounts[8];

    let daiOLEDexData;
    let usdtOLEDexData;
    let daiUsdtDexData;
    let dexAgg;
    let snapshotId;
    beforeEach(async () => {

        // runs once before the first test in this block
        let controller = await utils.createController(admin);
        m.log("Created Controller", last8(controller.address));

        uniswapFactory = await utils.createUniswapV2Factory(admin);
        m.log("Created UniswapFactory", last8(uniswapFactory.address));

        ole = await TestToken.new('OpenLevERC20', 'OLE');
        usdt = await TestToken.new('Tether', 'USDT');
        dai = await TestToken.new('DAI', 'DAI');

        let pair = await MockUniswapV2Pair.new(usdt.address, dai.address, toWei(10000), toWei(10000));
        let oleUsdtPair = await MockUniswapV2Pair.new(usdt.address, ole.address, toWei(100000), toWei(100000));
        let oleDaiPair = await MockUniswapV2Pair.new(dai.address, ole.address, toWei(100000), toWei(100000));
        daiOLEDexData = Uni2DexData + addressToBytes(dai.address) + addressToBytes(ole.address);
        usdtOLEDexData = Uni2DexData + addressToBytes(usdt.address) + addressToBytes(ole.address);
        daiUsdtDexData = Uni2DexData + addressToBytes(dai.address) + addressToBytes(usdt.address);


        m.log("ole.address=", ole.address);
        m.log("usdt.address=", usdt.address);
        m.log("dai.address=", dai.address);

        m.log("daiOLEDexData=", daiOLEDexData);
        m.log("usdtOLEDexData=", usdtOLEDexData);
        m.log("Created MockUniswapV2Pair (", last8(await pair.token0()), ",", last8(await pair.token1()), ")");

        await uniswapFactory.addPair(pair.address);
        await uniswapFactory.addPair(oleUsdtPair.address);
        await uniswapFactory.addPair(oleDaiPair.address);
        m.log("Added pairs", last8(pair.address), last8(oleUsdtPair.address), last8(oleDaiPair.address));
        dexAgg = await utils.createEthDexAgg(uniswapFactory.address, "0x0000000000000000000000000000000000000000", admin);
        // Making sure the pair has been added correctly in mock
        let gotPair = await MockUniswapV2Pair.at(await uniswapFactory.getPair(usdt.address, dai.address));
        assert.equal(await pair.token0(), await gotPair.token0());
        assert.equal(await pair.token1(), await gotPair.token1());
        xole = await utils.createXOLE(ole.address, admin, dev, dexAgg.address);
        await xole.setShareToken(ole.address);
        await xole.setOleLpStakeToken(ole.address, {from: admin});
        m.log("Created xOLE", last8(xole.address));
        await utils.mint(usdt, xole.address, 10000);

        resetStep();
        let lastbk = await web3.eth.getBlock('latest');
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));
        await advanceBlockAndSetTime(timeToMove);
        let snapshot = await timeMachine.takeSnapshot();
        snapshotId = snapshot['result'];
    });

    afterEach(async () => {
        await timeMachine.revertToSnapshot(snapshotId);
    });
  
    
    
})
