const { expect } = require("chai");
const { ethers } = require("hardhat");

async function expectError(message, fn) {
  let error = "";
  try {
    await fn();
  } catch (e) {
    error = e.message;
  }
  expect(error).to.contain(message);
}

describe("DGMarketplace", function () {

  beforeEach(async function() {
    const [owner, feeOwner, seller, buyer] = await ethers.getSigners();
    this.owner = owner; // 0x66f6a017e6b8F6A321239c1f9A76b6Bc9d147340
    this.feeOwner  = feeOwner;
    this.seller = seller;
    this.buyer = buyer;

    this.ICEMock = await ethers.getContractFactory("ERC20Mock");
    this.iceMock = await this.ICEMock.deploy("ICE Mock", "mICE", this.owner.address, 0);
    await this.iceMock.deployed();

    fee = 50000;

    this.Marketplace = await ethers.getContractFactory("DGMarketplace");
    this.marketplace = await this.Marketplace.deploy(this.iceMock.address, this.feeOwner.address, fee);
    await this.marketplace.deployed();

    this.Collection = await ethers.getContractFactory("ERC721Mock");
    this.collection = await this.Collection.deploy("NFT Collection Mock", "mNFT");
    await this.collection.deployed();

    for (let i = 1; i < 10; i++) {
      this.collection.mint(this.seller.address, i);
    }
  });

  //-----

  it("sets owner", async function () {
    expect(await this.marketplace.owner()).to.equal(this.owner.address);
  });

  it("sets acceptedToken", async function () {
    expect(await this.marketplace.acceptedToken()).to.equal(this.iceMock.address);
  });

  it("sets feeOwner", async function () {
    expect(await this.marketplace.feeOwner()).to.equal(this.feeOwner.address);
  });

  it("sets fee", async function () {
    expect(await this.marketplace.fee()).to.equal(50000);
  });

  //-----

  it("mint to seller", async function () {
    for (let i = 1; i < 10; i++) {
      expect(await this.collection.ownerOf(i)).to.equal(this.seller.address);
    }
  });

  //-----

  it("seller sale", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);
    await this.marketplace.connect(this.seller).sell(this.collection.address, [1], [10000]);

    expect(await this.marketplace.getPrice(this.collection.address, 1)).to.equal(10000);
    expect(await this.collection.ownerOf(1)).to.equal(this.marketplace.address);
    expect(await this.marketplace.isActive(this.collection.address, 1)).to.equal(true);
  });

  it("seller batch sale", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);
    await this.marketplace.connect(this.seller).sell(this.collection.address, [1,2], [10000, 20000]);

    expect(await this.marketplace.getPrice(this.collection.address, 1)).to.equal(10000);
    expect(await this.collection.ownerOf(1)).to.equal(this.marketplace.address);
    expect(await this.marketplace.isActive(this.collection.address, 1)).to.equal(true);

    expect(await this.marketplace.getPrice(this.collection.address, 2)).to.equal(20000);
    expect(await this.collection.ownerOf(2)).to.equal(this.marketplace.address);
    expect(await this.marketplace.isActive(this.collection.address, 2)).to.equal(true);
  });

  it("seller batch sale - length mismatch fail", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);

    await expectError("LENGTH_MISMATCH", async () => {
      await this.marketplace.connect(this.seller).sell(this.collection.address, [1,2], [10000]);
    });

    expect(await this.marketplace.getPrice(this.collection.address, 1)).to.equal(0);
    expect(await this.collection.ownerOf(1)).to.equal(this.seller.address);
    expect(await this.marketplace.isActive(this.collection.address, 1)).to.equal(false);

    expect(await this.marketplace.getPrice(this.collection.address, 2)).to.equal(0);
    expect(await this.collection.ownerOf(2)).to.equal(this.seller.address);
    expect(await this.marketplace.isActive(this.collection.address, 2)).to.equal(false);
  });

  it("seller cancel", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);
    await this.marketplace.connect(this.seller).sell(this.collection.address, [1], [10000]);

    expect(await this.marketplace.getPrice(this.collection.address, 1)).to.equal(10000);
    expect(await this.collection.ownerOf(1)).to.equal(this.marketplace.address);

    await this.marketplace.connect(this.seller).cancel(this.collection.address, [1]);

    expect(await this.collection.ownerOf(1)).to.equal(this.seller.address);
    expect(await this.marketplace.isActive(this.collection.address, 1)).to.equal(false);
  });

  it("reverts unathorized cancel", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);
    await this.marketplace.connect(this.seller).sell(this.collection.address, [1], [10000]);

    expect(await this.marketplace.getPrice(this.collection.address, 1)).to.equal(10000);
    expect(await this.collection.ownerOf(1)).to.equal(this.marketplace.address);

    await expectError("FAILED_UNAUTHORIZED", async () => {
      await this.marketplace.connect(this.buyer).cancel(this.collection.address, [1]);
    });
  });

  it("seller batch cancel", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);
    await this.marketplace.connect(this.seller).sell(this.collection.address, [1,2], [10000,20000]);

    expect(await this.marketplace.getPrice(this.collection.address, 1)).to.equal(10000);
    expect(await this.collection.ownerOf(1)).to.equal(this.marketplace.address);
    expect(await this.marketplace.getPrice(this.collection.address, 2)).to.equal(20000);
    expect(await this.collection.ownerOf(2)).to.equal(this.marketplace.address);

    await this.marketplace.connect(this.seller).cancel(this.collection.address, [1,2]);

    expect(await this.collection.ownerOf(1)).to.equal(this.seller.address);
    expect(await this.marketplace.isActive(this.collection.address, 1)).to.equal(false);
    expect(await this.collection.ownerOf(2)).to.equal(this.seller.address);
    expect(await this.marketplace.isActive(this.collection.address, 2)).to.equal(false);
  });

  it("buyer buys", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);
    await this.marketplace.connect(this.seller).sell(this.collection.address, [1], [10000]);

    expect(await this.marketplace.getPrice(this.collection.address, 1)).to.equal(10000);
    expect(await this.collection.ownerOf(1)).to.equal(this.marketplace.address);
    expect(await this.marketplace.isActive(this.collection.address, 1)).to.equal(true);

    await this.iceMock.mint(this.buyer.address, 100000);
    await this.iceMock.connect(this.buyer).approve(this.marketplace.address, 100000);
    await this.marketplace.connect(this.buyer).buy(this.collection.address, [1]);

    expect(await this.collection.ownerOf(1)).to.equal(this.buyer.address);
    expect(await this.iceMock.balanceOf(this.buyer.address)).to.equal(90000);
    expect(await this.marketplace.isActive(this.collection.address, 1)).to.equal(false);
  });

  it("buyer batch buys", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);
    await this.marketplace.connect(this.seller).sell(this.collection.address, [1,2], [10000,20000]);

    expect(await this.marketplace.getPrice(this.collection.address, 1)).to.equal(10000);
    expect(await this.collection.ownerOf(1)).to.equal(this.marketplace.address);
    expect(await this.marketplace.getPrice(this.collection.address, 2)).to.equal(20000);
    expect(await this.collection.ownerOf(2)).to.equal(this.marketplace.address);

    await this.iceMock.mint(this.buyer.address, 100000);
    await this.iceMock.connect(this.buyer).approve(this.marketplace.address, 100000);
    await this.marketplace.connect(this.buyer).buy(this.collection.address, [1,2]);

    expect(await this.collection.ownerOf(1)).to.equal(this.buyer.address);
    expect(await this.iceMock.balanceOf(this.buyer.address)).to.equal(70000);
    expect(await this.marketplace.isActive(this.collection.address, 1)).to.equal(false);

    expect(await this.collection.ownerOf(2)).to.equal(this.buyer.address);
    expect(await this.iceMock.balanceOf(this.buyer.address)).to.equal(70000);
    expect(await this.marketplace.isActive(this.collection.address, 2)).to.equal(false);
  });

  it("withdraws requested token to owner", async function () {
    await this.iceMock.mint(this.marketplace.address, 100000);

    await this.marketplace.withdrawERC20(this.iceMock.address, 100000);

    expect(await this.iceMock.balanceOf(this.marketplace.address)).to.equal(0);
    expect(await this.iceMock.balanceOf(this.owner.address)).to.equal(100000);
  });

  it("reverts withdrawERC20 if caller is not the owner", async function () {
    await this.iceMock.mint(this.marketplace.address, 100000);

    await expectError("Ownable: caller is not the owner", async () => {
      await this.marketplace.connect(this.seller).withdrawERC20(this.iceMock.address, 100000);
    });
  });

  it("withdraws requested nft to owner", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);
    await this.marketplace.connect(this.seller).sell(this.collection.address, [1,2], [10000, 20000]);

    await this.marketplace.withdrawERC721(this.collection.address, 1);

    expect(await this.collection.ownerOf(1)).to.equal(this.owner.address);
    expect(await this.collection.ownerOf(2)).to.equal(this.marketplace.address);
  });

  it("reverts withdrawERC721 if caller is not the owner", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);
    await this.marketplace.connect(this.seller).sell(this.collection.address, [1,2], [10000, 20000]);

    await expectError("Ownable: caller is not the owner", async () => {
      await this.marketplace.connect(this.seller).withdrawERC721(this.collection.address, 1);
    });
    expect(await this.collection.ownerOf(1)).to.equal(this.marketplace.address);
    expect(await this.collection.ownerOf(2)).to.equal(this.marketplace.address);
  });

  it("updates fee", async function () {
    newFee = 100000;
    await this.marketplace.connect(this.owner).setFee(newFee);

    expect(await this.marketplace.fee()).to.equal(newFee);
  });

  it("updates feeOwner", async function () {
    newFeeOwner = this.owner.address;
    await this.marketplace.connect(this.owner).setFeeOwner(newFeeOwner);

    expect(await this.marketplace.feeOwner()).to.equal(newFeeOwner);
  });

  //----------

  it("reverts buy for unsupported collection", async function () {
    await expectError("COLLECTION_UNAVAILABLE", async () => {
      await this.marketplace.connect(this.buyer).buy(this.collection.address, [1]);
    });
  });

  it("reverts buy for unsupported tokenId", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);
    await this.marketplace.connect(this.seller).sell(this.collection.address, [1], [10000]);

    await expectError("COLLECTION_UNAVAILABLE", async () => {
      await this.marketplace.connect(this.buyer).buy(this.collection.address, [999]);
    });
  });

  it("reverts buy for already bought nft", async function () {
    await this.collection.connect(this.seller).setApprovalForAll(this.marketplace.address, true);
    await this.marketplace.connect(this.seller).sell(this.collection.address, [1], [10000]);

    await this.iceMock.mint(this.buyer.address, 100000);
    await this.iceMock.connect(this.buyer).approve(this.marketplace.address, 100000);
    await this.marketplace.connect(this.buyer).buy(this.collection.address, [1]);

    await expectError("COLLECTION_UNAVAILABLE", async () => {
      await this.marketplace.buy(this.collection.address, [1]);
    });
  });
});