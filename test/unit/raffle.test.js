const { deployments, ethers, getNamedAccounts, network } = require("hardhat")
const { assert, expect } = require("chai")
const { CustomError } = require("hardhat/internal/core/errors")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")
const { AlchemyWebSocketProvider } = require("@ethersproject/providers")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntraceFee, deployer, raffleInterval

          const chainId = network.config.chainId
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              raffleEntraceFee = await ethers.utils.parseEther("2")
              raffleInterval = await raffle.getInterval()
              vrfCoordinatorV2Mock.addConsumer(raffle.getSubscriptionId(), raffle.address)
          })
          describe("constructor", function () {
              it("Inizilizate constructor", async function () {
                  // Ideally we make our test 1 asseert per it
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(raffleInterval.toString(), networkConfig[chainId]["interval"])
              })
          })
          describe("Enter Raffle", function () {
              it("Revert if not pay enought", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughtETHEntered"
                  )
              })
              it("record player when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntraceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })
              it("Emmit Event on Enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntraceFee })).to.emit(
                      raffle,
                      "raffleEnter"
                  )
              })
              it("dont let enter when raffle is not open", async function () {
                  await raffle.enterRaffle({ value: raffleEntraceFee })
                  await network.provider.send("evm_increaseTime", [raffleInterval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //   await network.provider.request({ method: "evm_mine", params: [] })
                  //prented to be chainlink keeper
                  await raffle.performUpkeep([])

                  await expect(raffle.enterRaffle({ value: raffleEntraceFee })).to.be.revertedWith(
                      "Raffle__NotOppen"
                  )
                  //opcion 2
                  //   const raffleState = await raffle.getRaffleState()
                  //   assert.equal(raffleState.toString(), "1")
              })
          })
          describe("checkupKeep", function () {
              it("return false if people havent sent ETH", async function () {
                  {
                      await network.provider.send("evm_increaseTime", [
                          raffleInterval.toNumber() + 1,
                      ])
                      await network.provider.send("evm_mine", [])
                      //to avoid do transaction only simulate use callStatic
                      const { upKeepNeeded } = await raffle.callStatic.checkUpkeep([])
                      assert(!upKeepNeeded)
                  }
              })
              it("return false if raffle isnt open", async function () {
                  await raffle.enterRaffle({ value: raffleEntraceFee })
                  await network.provider.send("evm_increaseTime", [raffleInterval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep([])
                  const raffleState = await raffle.getRaffleState()
                  const { upKeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  assert.equal(raffleState.toString(), "1")
                  assert(!upKeepNeeded)
              })
          })
          describe("performancekeep", function () {
              it("it can only run if checkupkeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntraceFee })
                  await network.provider.send("evm_increaseTime", [raffleInterval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep([])
                  assert(tx)
              })
              it("revert if checkupkeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded"
                  )
              })
              it("it can only run if checkupkeep is true should emit a event", async function () {
                  await raffle.enterRaffle({ value: raffleEntraceFee })
                  await network.provider.send("evm_increaseTime", [raffleInterval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //opcion 1
                  //  await expect(raffle.performUpkeep([])).to.emit(raffle, "ResquestedRaffleWinner")
                  // opcion 2 mas verificaciones
                  const txResp = await raffle.performUpkeep([])
                  const txRecei = await txResp.wait(1)
                  const txSubsId = txRecei.events[1].args.resquestId
                  const raffleState = await raffle.getRaffleState()
                  //   console.log(txSubsId)
                  assert(txSubsId.toNumber() > 0)
                  assert(raffleState.toString() == "1")

                  // await expect(raffle.enterRaffle({ value: raffleEntraceFee })).to.emit(
                  //     raffle,
                  //     "raffleEnter"
              })
          })
          describe("fullfilrandomword", function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntraceFee })
                  await network.provider.send("evm_increaseTime", [raffleInterval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performupKeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })
              //way bigss
              it("picks a winner, reset the lottery, and sends money", async function () {
                  const additionEntrane = 3
                  const startingAccountIndex = 2 // deployer = 0
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionEntrane;
                      i++
                  ) {
                      let accountsConnectedRaffle = raffle.connect(accounts[i])
                      await accountsConnectedRaffle.enterRaffle({ value: raffleEntraceFee })
                  }

                  const startingTimeStamp = await raffle.getLastestTimeStamp()
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the event!!")
                          try {
                              const winnerBalance = await accounts[2].getBalance()
                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp = await raffle.getLastestTimeStamp()
                              const numPlayer = await raffle.getNumPlayers()
                              const recentWinner = await raffle.getRecentWinner()
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[2].address)
                              console.log(accounts[3].address)
                              console.log(`El ganador es ${recentWinner}`)
                              assert.equal(numPlayer.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)
                              assert.equal(
                                  winnerBalance.toString(),
                                  startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                      .add(
                                          raffleEntraceFee
                                              .mul(additionEntrane)
                                              .add(raffleEntraceFee)
                                      )
                                      .toString()
                              )
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })
                      const tx = await raffle.performUpkeep([])

                      const txReceipt = await tx.wait(1)
                      const startingBalance = await accounts[2].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.resquestId,
                          raffle.address
                      )
                  })
              })
          })
      })
