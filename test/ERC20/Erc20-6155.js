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

    it("Convert current erc20 holdings to reward, withdrawn dev fund", async () => {

        assert.equal('0', (await ole.balanceOf(xole.address)).toString());

        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(10000), lastbk.timestamp + 2 * WEEK + 10);

        await xole.convertToSharingToken(toWei(1), 0, usdtOLEDexData);
        m.log("devFund:", (await xole.devFund()).toString());
        m.log("totalRewarded:", (await xole.totalRewarded()).toString());
        m.log("supply:", (await xole.totalLocked()).toString());
        m.log("lastUpdateTime:", (await xole.lastUpdateTime()).toString());
        m.log("rewardPerTokenStored:", (await xole.rewardPerTokenStored()).toString());
        assert.equal('498495030004550854', (await xole.devFund()).toString());

        m.log("Withdrawing dev fund");
        await xole.withdrawDevFund({from: dev});
        assert.equal('0', (await xole.devFund()).toString());
        assert.equal('10000498495030004550855', (await ole.balanceOf(xole.address)).toString());
        assert.equal('498495030004550854', (await ole.balanceOf(dev)).toString());
        m.log("Dev Fund balance:", await xole.devFund());
        m.log("Dev OLE balance:", await ole.balanceOf(dev));
        m.log("xOLE OLE balance:", await ole.balanceOf(xole.address));
    })

    it("Convert OLE Token exceed available", async () => {
        await ole.mint(xole.address, toWei(10000));
        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(10000), lastbk.timestamp + 2 * WEEK + 10);

        await xole.convertToSharingToken(toWei(10000), 0, '0x');

        m.log("Withdrawing dev fund");
        await xole.withdrawDevFund({from: dev});

        m.log("ole balance in xOLE:", await ole.balanceOf(xole.address));
        m.log("supply:", await xole.totalLocked());
        m.log("totalRewarded:", await xole.totalRewarded());
        m.log("withdrewReward:", await xole.withdrewReward());
        m.log("devFund:", await xole.devFund());
        await assertThrows(xole.convertToSharingToken(toWei(1), 0, '0x'), 'Exceed share token balance');

    })

    it("Convert Sharing Token correct", async () => {
        await dai.mint(xole.address, toWei(1000));
        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(10000), lastbk.timestamp + 2 * WEEK + 10);
        await xole.convertToSharingToken(toWei(1000), 0, daiOLEDexData);

        m.log("xOLE OLE balance:", await ole.balanceOf(xole.address));
        assert.equal('10987158034397061298850', (await ole.balanceOf(xole.address)).toString());

        m.log("xOLE totalRewarded:", await xole.totalRewarded());
        assert.equal('493579017198530649425', (await xole.totalRewarded()).toString());

        m.log("xOLE devFund:", await xole.devFund());
        assert.equal('493579017198530649425', (await xole.devFund()).toString());

        m.log("xOLE withdrewReward:", await xole.withdrewReward());
        assert.equal('0', (await xole.withdrewReward()).toString());
        m.log("xole.totalSupply", (await xole.totalSupply()).toString());
        m.log("xole.balanceOf", (await xole.balanceOf(admin)).toString());
        
        assert.equal('0', (await xole.rewardPerTokenStored()).toString());
        // withdraw devFund
        await xole.withdrawDevFund({from: dev});
        assert.equal('493579017198530649425', (await ole.balanceOf(dev)).toString());
        // withdraw communityFund
        await xole.withdrawCommunityFund(communityAcc);
        assert.equal('493579017198530649425', (await ole.balanceOf(communityAcc)).toString());
        assert.equal('493579017198530649425', (await xole.withdrewReward()).toString());
        //add sharingToken Reward 2000
        await usdt.mint(xole.address, toWei(2000));
        //sharing 1000
        await xole.convertToSharingToken(toWei(1000), 0, usdtOLEDexData);
        assert.equal('987158034397061298850', (await xole.totalRewarded()).toString());
        //Exceed available balance
        await assertThrows(xole.convertToSharingToken(toWei(20001), 0, usdtOLEDexData), 'Exceed available balance');
    })

    it("Convert DAI to USDT", async () => {
        await dai.mint(xole.address, toWei(1000));
        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(10000), lastbk.timestamp + 2 * WEEK);
        assert.equal('10000000000000000000000', (await usdt.balanceOf(xole.address)).toString());
        await xole.convertToSharingToken(toWei(1000), 0, daiUsdtDexData);
        m.log("xOLE USDT balance:", await usdt.balanceOf(xole.address));
        assert.equal('10906610893880149131581', (await usdt.balanceOf(xole.address)).toString());

        m.log("xOLE DAI balance:", await dai.balanceOf(xole.address));
        assert.equal('0', (await dai.balanceOf(xole.address)).toString());

        m.log("xOLE OLE balance:", await ole.balanceOf(xole.address));
        assert.equal('10000000000000000000000', (await ole.balanceOf(xole.address)).toString());

        m.log("xOLE totalRewarded:", await xole.totalRewarded());
        assert.equal('0', (await xole.totalRewarded()).toString());

        m.log("xOLE devFund:", await xole.devFund());
        assert.equal('0', (await xole.devFund()).toString());
    })

    it("Convert DAI to USDT to OLE ", async () => {
        await dai.mint(xole.address, toWei(1000));
        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(10000), lastbk.timestamp + 2 * WEEK + 10);
        assert.equal('10000000000000000000000', (await usdt.balanceOf(xole.address)).toString());
        await xole.convertToSharingToken(toWei(1000), 0, "0x01" + "000000" + "03" + addressToBytes(dai.address) + addressToBytes(usdt.address) + addressToBytes(ole.address));
        m.log("xOLE USDT balance:", await usdt.balanceOf(xole.address));
        assert.equal('10000000000000000000000', (await usdt.balanceOf(xole.address)).toString());

        m.log("xOLE DAI balance:", await dai.balanceOf(xole.address));
        assert.equal('0', (await dai.balanceOf(xole.address)).toString());

        m.log("xOLE OLE balance:", await ole.balanceOf(xole.address));
        assert.equal('10895794058774498675511', (await ole.balanceOf(xole.address)).toString());

        m.log("xOLE totalRewarded:", await xole.totalRewarded());
        assert.equal('447897029387249337756', (await xole.totalRewarded()).toString());

        m.log("xOLE devFund:", await xole.devFund());
        assert.equal('447897029387249337755', (await xole.devFund()).toString());
    })
    
    it("John Deposit for 1 weeks, Tom 2 weeks", async () => {

        await ole.mint(john, toWei(10000));
        await ole.mint(tom, toWei(10000));
        await dai.mint(xole.address, toWei(1000));
        await ole.approve(xole.address, toWei(500), {from: john});
        await ole.approve(xole.address, toWei(500), {from: tom});

        let lastbk = await web3.eth.getBlock('latest');
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));

        step("John stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + 2 * WEEK + 60, {from: john});
        step("Tom stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + (2 * WEEK) + 60 * 60, {from: tom});
        assertPrint("Total staked:", toWei(1000), await xole.totalLocked());
        step("New reward 1");
        await xole.convertToSharingToken(toWei(1), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '498495030004550854', await xole.devFund());
        assertPrint("Total to share:", '498495030004550855', await xole.totalRewarded());
    })

    it("John Deposit for 1 weeks, Tom 2 weeks increase amount yet", async () => {

        await ole.mint(john, toWei(10000));
        await ole.mint(tom, toWei(10000));
        await dai.mint(xole.address, toWei(1000));
        await ole.approve(xole.address, toWei(500), {from: john});
        await ole.approve(xole.address, toWei(1000), {from: tom});

        let lastbk = await web3.eth.getBlock('latest');
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));

        step("John stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + 2 * WEEK + 10, {from: john});
        step("Tom stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + (2 * WEEK) + 60 * 60, {from: tom});
        await xole.increase_amount(toWei(500), {from: tom});

        assertPrint("Total staked:", toWei(1500), await xole.totalLocked());
        step("New reward 1");
        await xole.convertToSharingToken(toWei(1), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '498495030004550854', await xole.devFund());
        assertPrint("Total to share:", '498495030004550855', await xole.totalRewarded());
    })

    it("John Deposit for 1 weeks, Tom 2 weeks increase unlock time to 4 weeks", async () => {

        await ole.mint(john, toWei(10000));
        await ole.mint(tom, toWei(10000));
        await dai.mint(xole.address, toWei(1000));
        await ole.approve(xole.address, toWei(500), {from: john});
        await ole.approve(xole.address, toWei(1000), {from: tom});
        let lastbk = await web3.eth.getBlock('latest');
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));

        step("John stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + 2 * WEEK + 60, {from: john});
        step("Tom stake 500 2 weeks");
        lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(500), timeToMove + (2 * WEEK) + 60 * 60, {from: tom});
        timeToMove = lastbk.timestamp + WEEK;
        await xole.increase_unlock_time(timeToMove + (4 * WEEK) + 60 * 60, {from: tom});

        step("New reward 1");
        await xole.convertToSharingToken(toWei(1), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '498495030004550854', await xole.devFund());
        assertPrint("Total to share:", '498495030004550855', await xole.totalRewarded());
    })



  
    
    
})
