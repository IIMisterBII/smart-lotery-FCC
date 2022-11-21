const { deployments, ethers, getNamedAccounts, network } = require("hardhat")
const { assert, expect } = require("chai")
const { CustomError } = require("hardhat/internal/core/errors")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")
const { AlchemyWebSocketProvider } = require("@ethersproject/providers")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle, raffleEntraceFee, deployer, winnerStartingBalance
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer)
              raffleEntraceFee = await raffle.getEntranceFeed()
          })
          describe("fullfilrandomword", function () {
              it("work with live  chainlink keeper and chainlink VRF", async function () {
                  console.log("Setting up test...")
                  const startingTimeStamp = await raffle.getLastestTimeStamp()
                  const accounts = await ethers.getSigners()
                  console.log("Setting up Listener...")
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the event!!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await raffle.getLastestTimeStamp()
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              await assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerBalance.toString(),
                                  winnerStartingBalance.add(raffleEntraceFee).toString()
                              )

                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(e)
                          }
                      })
                      console.log("Entering Raffle...")
                      const tx = await raffle.enterRaffle({ value: raffleEntraceFee })
                      await tx.wait(1)
                      console.log("Ok, time to wait...")
                      winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
