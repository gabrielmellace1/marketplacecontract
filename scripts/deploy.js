const hre = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("deployer:", deployer.address);

  acceptedToken = ethers.utils.getAddress("0xc6c855ad634dcdad23e64da71ba85b8c51e5ad7c")
  feeOwner = ethers.utils.getAddress("0xEA5Fed1D0141F14DE11249577921b08783d6A360")

  const Marketplace = await ethers.getContractFactory("DGMarketplace");
  const marketplace = await Marketplace.deploy(acceptedToken, feeOwner, 50000);
  await marketplace.deployed();

  await marketplace.connect(deployer).transferOwnership(feeOwner);
  
  console.log("DGMarketplace deployed to:", marketplace.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
