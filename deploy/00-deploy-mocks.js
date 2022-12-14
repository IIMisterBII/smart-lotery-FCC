const { utils } = require("ethers")
const { network, ethers } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")
const BASE_FEE = ethers.utils.parseEther("0.25") //0.25 is the premmium . it cost 0.25 link per request
const GAS_PRICE_LINK = 1e9 // 1000000000 ink per gas. calculation value based on the gas price of the chain
module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const args = [BASE_FEE, GAS_PRICE_LINK]

    if (developmentChains.includes(network.name)) {
        log("local network detected! deploying mocks...")
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: args,
        })

        log("Mocks Deployed!")
        log("--------------------------------------------")
    }
}
module.exports.tags = ["all", "mocks"]
