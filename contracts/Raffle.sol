//Raffle
//Enter lotery (paying some aumont)
//pick random winner (verify random)
// winner selected each x hours
// chainlink oracle chainlink keeper

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/AutomationCompatible.sol";

error Raffle__NotEnoughtETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOppen();
error Raffle__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

/**
 * @title A Sample Raffle Contract
 * @author Carlos B
 * @notice this contract is for creating an untamperable decentralized smart contrat
 * @dev this implements chainlink VRF V2 and chainlink Keepers
 */

contract Raffle is VRFConsumerBaseV2, AutomationCompatibleInterface {
    /** type declaratoion */
    enum RaffleState {
        OPEN,
        CALCULATION
    }
    /* Estate Variable */
    address payable[] private s_player;
    uint256 private immutable i_entranceFeed;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gaslane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private immutable i_callbackGasLimited;
    uint32 private constant NUMWORDS = 1;
    uint256 private immutable i_interval;

    /* Lottery Variable */
    address private s_recentWinner;
    RaffleState private s_rafflestate;
    uint256 private s_lastTimeStamp;

    constructor(
        address vrfCoordinatorV2, // contract address
        uint256 entranceFeed,
        bytes32 gaslane,
        uint64 subscriptionId,
        uint32 callbackGasLimited,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFeed = entranceFeed;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gaslane = gaslane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimited = callbackGasLimited;
        s_rafflestate = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    /*events*/
    event raffleEnter(address indexed player);
    event ResquestedRaffleWinner(uint256 indexed resquestId);
    event WinnerPicked(address indexed winner);

    function enterRaffle() public payable {
        if (msg.value < i_entranceFeed) {
            revert Raffle__NotEnoughtETHEntered();
        }
        if (s_rafflestate != RaffleState.OPEN) {
            revert Raffle__NotOppen();
        }
        s_player.push(payable(msg.sender));
        //event when update a dynamic array  or mappings
        emit raffleEnter(msg.sender);
    }

    /**
     * @dev this is a function that the Chainlink Keeper nodes call
     * they look for the 'upKeepNeeded' to return true
     * the following should be true in order to return true
     * 1. Our time interval should have passed
     * 2. the lottery should have at least 1 player, and some ETH
     * 3 Our sucrupcion is funded with link
     * 4. the lottery shold be in open state
     */

    function checkUpkeep(
        bytes memory /*checkData*/
    )
        public
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData*/
        )
    {
        bool isOpen = (RaffleState.OPEN == s_rafflestate);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayer = (s_player.length > 0);
        bool hasETH = (address(this).balance > 0);
        upkeepNeeded = (isOpen && timePassed && hasPlayer && hasETH);
        // return (upkeepNeeded, "0x0");
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__UpkeepNotNeeded(
                address(this).balance,
                s_player.length,
                uint256(s_rafflestate)
            );
        }
        //request random number
        //once we get it, do something with it
        s_rafflestate = RaffleState.CALCULATION;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gaslane, //gaslane
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimited,
            NUMWORDS
        );
        emit ResquestedRaffleWinner(requestId);
    }

    function fulfillRandomWords(
        uint256,
        /*requestID*/
        uint256[] memory randomWords
    ) internal override {
        //request random number
        //once we get it, do something with it
        uint256 indexOfWinner = randomWords[0] % s_player.length;
        address payable recentWinner = s_player[indexOfWinner];
        s_recentWinner = recentWinner;
        s_rafflestate = RaffleState.OPEN;
        s_player = new address payable[](0);
        s_lastTimeStamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    function getEntranceFeed() public view returns (uint256) {
        return i_entranceFeed;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_player[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_rafflestate;
    }

    function getNumWords() public pure returns (uint256) {
        return NUMWORDS;
    }

    function getNumPlayers() public view returns (uint256) {
        return s_player.length;
    }

    function getLastestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmation() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getSubscriptionId() public view returns (uint64) {
        return i_subscriptionId;
    }
}
