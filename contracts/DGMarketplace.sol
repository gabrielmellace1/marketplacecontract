// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DGMarketplace is Ownable, ReentrancyGuard {
    struct Order {
        bool active;
        uint256 price;
        address beneficiary;
    }

    mapping(address => mapping(uint256 => Order)) public orderbook;

    uint256 public constant BASE_FEE = 1000000;
    IERC20 public acceptedToken;
    uint256 public fee;
    address public feeOwner;

    event Sell(
        address indexed _nftAddress,
        uint256[] indexed _tokenIds,
        uint256[] _prices
    );
    event Cancel(address indexed _nftAddress, uint256[] indexed _tokenIds);
    event Buy(address indexed _nftAddress, uint256[] indexed _tokenIds);
    event SetFee(uint256 _oldFee, uint256 _newFee);
    event SetFeeOwner(
        address indexed _oldFeeOwner,
        address indexed _newFeeOwner
    );

    constructor(
        IERC20 _acceptedToken,
        address _feeOwner,
        uint256 _fee
    ) {
        acceptedToken = _acceptedToken;
        feeOwner = _feeOwner;
        fee = _fee;
    }

    function sell(
        address _nftAddress,
        uint256[] calldata _tokenIds,
        uint256[] calldata _prices
    ) external nonReentrant {
        require(
            _tokenIds.length == _prices.length,
            "DGMarketplace#sell: LENGTH_MISMATCH"
        );

        address sender = msg.sender;

        for (uint256 i = 0; i < _tokenIds.length; i++) {
            uint256 tokenId = _tokenIds[i];
            uint256 price = _prices[i];

            Order storage order = orderbook[_nftAddress][tokenId];
            order.price = price;
            order.beneficiary = sender;
            order.active = true;

            IERC721(_nftAddress).safeTransferFrom(
                sender,
                address(this),
                tokenId
            );
        }
        emit Sell(_nftAddress, _tokenIds, _prices);
    }

    function cancel(address _nftAddress, uint256[] calldata _tokenIds)
        external
        nonReentrant
    {
        address sender = msg.sender;

        for (uint256 i = 0; i < _tokenIds.length; i++) {
            uint256 tokenId = _tokenIds[i];
            Order storage order = orderbook[_nftAddress][tokenId];

            require(
                isActive(_nftAddress, tokenId),
                "DGMarketplace#cancel: COLLECTION_UNAVAILABLE"
            );
            require(
                sender == order.beneficiary,
                "DGMarketplace#cancel: FAILED_UNAUTHORIZED"
            );

            order.active = false;

            IERC721(_nftAddress).safeTransferFrom(
                address(this),
                sender,
                tokenId
            );
        }
        emit Cancel(_nftAddress, _tokenIds);
    }

    function buy(address _nftAddress, uint256[] calldata _tokenIds)
        public
        nonReentrant
    {
        address sender = msg.sender;

        for (uint256 i = 0; i < _tokenIds.length; i++) {
            uint256 tokenId = _tokenIds[i];
            Order storage order = orderbook[_nftAddress][tokenId];

            require(
                isActive(_nftAddress, tokenId),
                "DGMarketplace#buy: COLLECTION_UNAVAILABLE"
            );

            address beneficiary = order.beneficiary;

            uint256 saleAmount = order.price;
            uint256 saleFee = (saleAmount * fee) / BASE_FEE;

            require(
                acceptedToken.transferFrom(
                    sender,
                    beneficiary,
                    saleAmount - saleFee
                ),
                "DGMarketplace#buy: TRANSFER_PRICE_FAILED"
            );

            require(
                acceptedToken.transferFrom(sender, feeOwner, saleFee),
                "DGMarketplace#buy: TRANSFER_FEES_FAILED"
            );

            order.active = false;

            IERC721(_nftAddress).safeTransferFrom(
                address(this),
                sender,
                tokenId
            );
        }
        emit Buy(_nftAddress, _tokenIds);
    }

    function isActive(address _nftAddress, uint256 _tokenId)
        public
        view
        returns (bool)
    {
        return orderbook[_nftAddress][_tokenId].active;
    }

    function getPrice(address _nftAddress, uint256 _tokenId)
        public
        view
        returns (uint256)
    {
        return orderbook[_nftAddress][_tokenId].price;
    }

    /**
     * @notice Sets the fee of the contract that's charged to the seller on each sale
     * @param _newFee - Fee from 0 to 999,999
     */
    function setFee(uint256 _newFee) public onlyOwner {
        require(
            _newFee < BASE_FEE,
            "DGMarketplace#setFee: FEE_SHOULD_BE_LOWER_THAN_BASE_FEE"
        );
        require(_newFee != fee, "DGMarketplace#setFee: SAME_FEE");

        emit SetFee(fee, _newFee);
        fee = _newFee;
    }

    /**
     * @notice Set a new fee owner.
     * @param _newFeeOwner - Address of the new fee owner
     */
    function setFeeOwner(address _newFeeOwner) external onlyOwner {
        require(
            _newFeeOwner != address(0),
            "DGMarketplace#setFeeOwner: INVALID_ADDRESS"
        );
        require(
            _newFeeOwner != feeOwner,
            "DGMarketplace#setFeeOwner: SAME_FEE_OWNER"
        );

        emit SetFeeOwner(feeOwner, _newFeeOwner);
        feeOwner = _newFeeOwner;
    }

    function withdrawERC20(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).transfer(msg.sender, _amount);
    }

    function withdrawERC721(address _nftAddress, uint256 tokenId)
        external
        onlyOwner
    {
        IERC721(_nftAddress).safeTransferFrom(
            address(this),
            msg.sender,
            tokenId
        );
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    fallback() external payable {}
}
