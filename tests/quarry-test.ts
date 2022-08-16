import * as anchor from "@project-serum/anchor";
import { Address, Program } from "@project-serum/anchor";
import { QuarryTest } from "../target/types/quarry_test";
import { expectTX, assertTXSuccess } from "@saberhq/chai-solana";
import { AugmentedProvider, SolanaProvider } from "@saberhq/solana-contrib";
import { utils } from "@project-serum/anchor";
import { buildCoderMap } from "@saberhq/anchor-contrib";

import { MineWrapper, MintWrapper, MintWrapperProgram, QuarryData, QuarrySDK, QuarryWrapper, RewarderWrapper } from "@quarryprotocol/quarry-sdk"
// import makeSDK from "@quarryprotocol/quarry-sdk"
import type { Provider } from "@saberhq/solana-contrib"
import { Signer, SystemProgram } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js"
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as assert from "assert";
import { expect } from "chai";
import "chai"
import "chai-as-promised"
import {
  createInitMintInstructions,
  createMint,
  DEFAULT_TOKEN_DECIMALS,
  getMintInfo,
  Token,
  TokenAmount,
  getTokenAccount,
  u64,
  SPLToken,
  TOKEN_PROGRAM_ID,
  getOrCreateATA
} from "@saberhq/token-utils";
import invariant from "tiny-invariant";
import chaiAsPromised from "chai-as-promised";
import chai from "chai"
import { print } from "superstruct/lib/utils";
chai.use(chaiAsPromised);
chai.should();

describe("quarry sdk and cpi testing", () => {
  const { BN, web3 } = anchor;
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  let sdk: QuarrySDK;
  let provider: AugmentedProvider;
  let mintWrapper: MintWrapper;
  let mine: MineWrapper;

  const baseKP = Keypair.generate();

  let stakedMintAuthority: anchor.web3.Keypair;
  let stakeTokenMint: anchor.web3.PublicKey;
  let stakeToken: Token;
  
  const DAILY_REWARDS_RATE = new BN(1_000 * web3.LAMPORTS_PER_SOL);
  const ANNUAL_REWARDS_RATE = DAILY_REWARDS_RATE.mul(new BN(365));
  const quarryRewardsShare = ANNUAL_REWARDS_RATE.div(new BN(10));
  

  let rewardsMint: PublicKey;
  let token: Token;
  let mintWrapperKey: PublicKey;
  let hardCap: TokenAmount;
  
  let quarryData: QuarryData;
  let quarryKey: anchor.web3.PublicKey;
  let rewarderKey: anchor.web3.PublicKey;
  let rewarder: RewarderWrapper;
  let rewarderKeyCPI: anchor.web3.PublicKey;

  const program = anchor.workspace.QuarryTest as Program<QuarryTest>;
  const sign = Keypair.generate();

  const ZERO = new BN(0);
  const DEFAULT_DECIMALS = 6;
  const DEFAULT_HARD_CAP = 1_000_000_000_000;
    
  const rewardsMintKP = Keypair.generate();
  rewardsMint = rewardsMintKP.publicKey;

  before("Initialize SDK and set stake token", async () => {
    const anchorProvider = anchor.AnchorProvider.env();
    anchor.setProvider(anchorProvider);

    const solana_provider = SolanaProvider.load({
      connection: anchorProvider.connection,
      sendConnection: anchorProvider.connection,
      wallet: anchorProvider.wallet,
      opts: anchorProvider.opts,
    });
    

    sdk = QuarrySDK.load({
      provider: solana_provider,
    });
    provider = sdk.provider;
    mine = sdk.mine;
    mintWrapper = sdk.mintWrapper;

    await assert.doesNotReject(async () => {
      stakedMintAuthority = web3.Keypair.generate();
      stakeTokenMint = await createMint(
        provider,
        stakedMintAuthority.publicKey,
        DEFAULT_DECIMALS
      );
    });

    stakeToken = Token.fromMint(stakeTokenMint, DEFAULT_DECIMALS, {
      name: "stake token",
    });
  });

  before("Initialize Mint", async () => {
    token = Token.fromMint(rewardsMint, DEFAULT_DECIMALS);
    hardCap = TokenAmount.parse(token, DEFAULT_HARD_CAP.toString());
    const { tx, mintWrapper: wrapperKey } = await mintWrapper.newWrapper({
      hardcap: hardCap.toU64(),
      tokenMint: rewardsMint,
    });

    await expectTX(
      await createInitMintInstructions({
        provider,
        mintKP: rewardsMintKP,
        decimals: DEFAULT_DECIMALS,
        mintAuthority: wrapperKey,
        freezeAuthority: wrapperKey,
      })
    ).to.be.fulfilled;

    mintWrapperKey = wrapperKey;
    await expectTX(tx, "Initialize mint").to.be.fulfilled;
  })

  before("Initalize Mint through the CPI", async () => {
    const [ mintWrapperKeyCPI ] = await findMintWrapperAddress(baseKP.publicKey, program.programId);
    await program.methods.newMintWrapper(new BN(DEFAULT_HARD_CAP))
      .accounts({
        base: baseKP.publicKey,
        mintWrapper: mintWrapperKeyCPI,
        admin: provider.wallet.publicKey,
        tokenMint: rewardsMintKP.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        mintWrapperProgram: QUARRY_ADDRESSES.MintWrapper,
      }).signers([baseKP]).rpc();
  });

  describe("Sets Rewards Correctly", async () => {
    beforeEach("Initialize Rewarder", async () => {
      const { tx, key: theRewarderKey } = await mine.createRewarder({
        mintWrapper: mintWrapperKey,
        authority: provider.wallet.publicKey,
      });
      await expectTX(tx, "Create new rewarder").to.be.fulfilled;
      rewarderKey = theRewarderKey;
      rewarder = await mine.loadRewarderWrapper(rewarderKey);
      await expectTX(
        await rewarder.setAndSyncAnnualRewards(ANNUAL_REWARDS_RATE, []),
        "set annual rewards"
      );
    })

    beforeEach("Initialize Rewarder via CPI", async () => {
      // const [ rewarderKeyCPI ] = await findRewarderAddress(
      //   baseKP.publicKey,
      //   program.programId
      // );
      
      // const { address: claimFeeTokenAccount, instruction: createATAInstruction } =
      // await getOrCreateATA({
      //   provider: provider,
      //   mint: rewardsMint,
      //   owner: rewarderKeyCPI,
      // });

      // let tx = provider.newTX([
      //   createATAInstruction,
      //   program.instruction.createRewarder({
      //     accounts: {
      //       base: baseKP.publicKey,
      //       initialAuthority: provider.wallet.publicKey,
      //       rewarder: rewarderKeyCPI,
      //       payer: provider.wallet.publicKey,
      //       systemProgram: SystemProgram.programId,
      //       mintWrapper: mintWrapperKey,
      //       rewardsTokenMint: rewardsMint,
      //       claimFeeTokenAccount: claimFeeTokenAccount,
      //       mineProgram: QUARRY_ADDRESSES.Mine
      //     },
      //   })
      // ], []);

      // try {
      //   await expectTX(tx, "initialize rewarder through cpi").to.be.fulfilled;
      // } catch (e) {
      //   console.log(e)
      // }
      // createATAInstruction
      // // await expectTX(createATAInstruction, "ata instruction")
      // try {
      //   await program.methods.createRewarder()
      //     .accounts({
      //       base: baseKP.publicKey,
      //       initialAuthority: provider.wallet.publicKey,
      //       rewarder: rewarderKeyCPI,
      //       payer: provider.wallet.publicKey,
      //       systemProgram: SystemProgram.programId,
      //       mintWrapper: mintWrapperKey,
      //       rewardsTokenMint: rewardsMint,
      //       claimFeeTokenAccount: claimFeeTokenAccount,
      //       mineProgram: QUARRY_ADDRESSES.Mine
      //     }).signers([]).rpc();
      // } catch (e) {
      //   console.log(e)
      // } 

    });

    beforeEach("create a new quarry", async () => {
      const { quarry, tx } = await rewarder.createQuarry({
        token: stakeToken,
      });
      await expectTX(tx, "Create new quarry").to.be.fulfilled;

      const rewarderData = await mine.program.account.rewarder.fetch(
        rewarderKey
      );
      assert.strictEqual(rewarderData.numQuarries, 1);
      const quarryAccountInfo = await provider.connection.getAccountInfo(
        quarry
      );
      expect(quarryAccountInfo?.owner.toString()).eq(mine.program.programId.toString());

      assert.ok(quarryAccountInfo);
      quarryData = mine.program.coder.accounts.decode<QuarryData>(
        "Quarry",
        quarryAccountInfo.data
      );
      assert.strictEqual(
        quarryData.famineTs.toString(),
        "9223372036854775807"
      );
      assert.strictEqual(
        quarryData.tokenMintKey.toBase58(),
        stakeTokenMint.toBase58()
      );
      assert.strictEqual(
        quarryData.annualRewardsRate.toString(),
        ZERO.toString()
      );
      assert.strictEqual(quarryData.rewardsShare.toString(), ZERO.toString());

      quarryKey = quarry;
    });

    it("Set rewards share", async () => {
      await assert.doesNotReject(async () => {
        await mine.program.rpc.setRewardsShare(quarryRewardsShare, {
          accounts: {
            auth: {
              authority: provider.wallet.publicKey,
              rewarder: rewarderKey,
            },
            quarry: quarryKey,
          },
        });
      });

      // const rewarderData = await mine.program.account.rewarder.fetch(
      //   rewarderKey
      // );
      // expect(rewarderData.totalRewardsShares.toString()).to.equal(
      //   quarryRewardsShare.toString()
      // );

      let quarry = await rewarder.getQuarry(stakeToken);

      // expect(quarry.key.toString()).to.eq(quarryKey.toString());

      // expect(quarry.quarryData.lastUpdateTs.toString()).to.equal(
      //   quarryData.lastUpdateTs.toString()
      // );
      // expect(quarry.quarryData.annualRewardsRate.toString()).to.equal(
      //   quarryData.annualRewardsRate.toString()
      // );
      // expect(quarry.quarryData.rewardsShare.toString()).to.eq(
      //   quarryRewardsShare.toString()
      // );
      // expect(quarry.quarryData.annualRewardsRate.toString()).to.not.equal(
      //   quarry.computeAnnualRewardsRate().toString()
      // );

      const currentTime = Math.floor(new Date().getTime() / 1000);
      await assert.doesNotReject(async () => {
        const tx = await rewarder.syncQuarryRewards([stakeTokenMint]);
        await tx.confirm();
      });
      quarry = await rewarder.getQuarry(stakeToken);
      expect(
        quarry.quarryData.lastUpdateTs
          .sub(new BN(currentTime))
          .abs()
          .lte(new BN(1))
      ).to.be.true;
      const expectedRewardsRate = quarry.computeAnnualRewardsRate();
      expect(quarry.quarryData.annualRewardsRate.toString()).to.equal(
        expectedRewardsRate.toString()
      );
    });
  });

  describe("Miner Stakes and Withdraws", () => {
    let rewarderKey: anchor.web3.PublicKey;
    let rewarder: RewarderWrapper;
    let quarry: QuarryWrapper;

    beforeEach(async () => {
      const { tx, key: theRewarderKey } = await mine.createRewarder({
        mintWrapper: mintWrapperKey,
        authority: provider.wallet.publicKey,
      });
      await expectTX(tx, "Create new rewarder").to.be.fulfilled;
      rewarderKey = theRewarderKey;
      rewarder = await mine.loadRewarderWrapper(rewarderKey);
      await expectTX(
        await rewarder.setAndSyncAnnualRewards(ANNUAL_REWARDS_RATE, [])
      ).to.be.fulfilled;

      const { tx: quarryTx } = await rewarder.createQuarry({
        token: stakeToken,
      });
      await expectTX(quarryTx, "Create new quarry").to.be.fulfilled;
    });

    beforeEach("Create miner", async () => {
      quarry = await rewarder.getQuarry(stakeToken);
      expect(quarry).to.exist;

      // create the miner
      await expectTX((await quarry.createMiner()).tx, "create miner").to.be
        .fulfilled;
    });

    it("Stake and withdraw", async () => {
      // mint test tokens
      const amount = 1_000_000000;

      const userStakeTokenAccount = await newUserStakeTokenAccount(
        sdk,
        quarry,
        stakeToken,
        stakedMintAuthority,
        amount
      );

      // stake into the quarry
      const minerActions = await quarry.getMinerActions(
        provider.wallet.publicKey
      );
      await expectTX(
        minerActions.stake(new TokenAmount(stakeToken, amount)),
        "Stake into the quarry"
      ).to.be.fulfilled;

      let miner = await quarry.getMiner(provider.wallet.publicKey);
      invariant(miner, "miner must exist");

      const minerBalance = await getTokenAccount(provider, miner.tokenVaultKey);
      expect(minerBalance.amount.toString()).to.eq(amount.toString());

      let minerVaultInfo = await getTokenAccount(provider, miner.tokenVaultKey);
      expect(minerVaultInfo.amount.toString()).to.eq(amount.toString());
      let userStakeTokenAccountInfo = await getTokenAccount(
        provider,
        userStakeTokenAccount
      );
      expect(userStakeTokenAccountInfo.amount.toString()).to.eq(ZERO.toString());

      // withdraw from the quarry
      await expectTX(
        minerActions.withdraw(new TokenAmount(stakeToken, amount)),
        "Withdraw from the quarry"
      ).to.be.fulfilled;
      miner = await quarry.getMiner(provider.wallet.publicKey);
      invariant(miner, "miner must exist");

      const endMinerBalance = await getTokenAccount(
        provider,
        miner.tokenVaultKey
      );
      expect(endMinerBalance.amount.toString()).to.eq(ZERO.toString());

      minerVaultInfo = await getTokenAccount(provider, miner.tokenVaultKey);
      expect(minerVaultInfo.amount.toNumber()).to.eq(ZERO.toNumber());
      userStakeTokenAccountInfo = await getTokenAccount(
        provider,
        userStakeTokenAccount
      );
      expect(userStakeTokenAccountInfo.amount.toNumber()).to.eq(amount);
    });
    
    it("Stakes and Withdraws Through the CPI", async () => {
      const amount = 1_000_000_000;
      let miner = await quarry.getMiner(provider.wallet.publicKey);

      let [quarryAddress, stuff] = await findQuarryAddress(rewarderKey, stakeTokenMint);
      let [minerAddress, stuff2] = await findMinerAddress(quarryAddress, provider.wallet.publicKey);

      await program.methods.stakeTokens(new BN(amount))
        .accounts({
          authority: provider.wallet.publicKey,
          miner: minerAddress,
          quarry: quarryAddress,
          minerVault: miner.tokenVaultKey,
          rewarder: rewarderKey,
          tokenAccount: miner.tokenVaultKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          mineProgram: QUARRY_ADDRESSES.Mine,
        }).signers([]).rpc()
    });
  });


  describe("Set Rewards Through CPI", async () => {

    // before("create miner via cpi", async () => {
      
    //   await program.methods.createMiner().accounts({
    //     authority: provider.wallet.publicKey,
    //     miner: null,
    //     mineProgram: null,
    //     quarry: quarryKey,
    //     rewarder: rewarderKey,
    //     systemProgram: anchor.web3.SystemProgram.programId,
    //     payer: provider.wallet.publicKey,
    //     tokenMint: rewardsMint,
    //     minerVault: null,
    //     tokenProgram: rewarderKey,
    //   }).rpc();
    // });

    it("Stakes and Withdraws Through cpi", async () => {
      // expect(1).eq(2)
    });
  });
});

const newUserStakeTokenAccount = async (
  sdk: QuarrySDK,
  quarry: QuarryWrapper,
  stakeToken: Token,
  stakedMintAuthority: Signer,
  amount: number
): Promise<PublicKey> => {
  const minerActions = await quarry.getMinerActions(
    sdk.provider.wallet.publicKey
  );
  const createATA = await minerActions.createATAIfNotExists();
  if (createATA) {
    await expectTX(createATA, "create ATA").to.be.fulfilled;
  }

  const userStakeTokenAccount = minerActions.stakedTokenATA;
  await expectTX(
    sdk.newTx(
      [
        SPLToken.createMintToInstruction(
          TOKEN_PROGRAM_ID,
          stakeToken.mintAccount,
          userStakeTokenAccount,
          stakedMintAuthority.publicKey,
          [],
          amount
        ),
      ],
      [stakedMintAuthority]
    ),
    "mint initial"
  ).to.be.fulfilled;

  return userStakeTokenAccount;
};

const findQuarryAddress = async (
  rewarder: PublicKey,
  tokenMint: PublicKey,
  programID: PublicKey = QUARRY_ADDRESSES.Mine
): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [
      Buffer.from(utils.bytes.utf8.encode("Quarry")),
      rewarder.toBytes(),
      tokenMint.toBytes(),
    ],
    programID
  );
};

const findMinerAddress = async (
  quarry: PublicKey,
  authority: PublicKey,
  programID: PublicKey = QUARRY_ADDRESSES.Mine
): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [
      Buffer.from(utils.bytes.utf8.encode("Miner")),
      quarry.toBytes(),
      authority.toBytes(),
    ],
    programID
  );
};

const findRewarderAddress = async (
  base: PublicKey,
  programID: PublicKey = QUARRY_ADDRESSES.Mine
): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [Buffer.from(utils.bytes.utf8.encode("Rewarder")), base.toBytes()],
    programID
  );
};

const QUARRY_ADDRESSES = {
  MergeMine: new PublicKey("QMMD16kjauP5knBwxNUJRZ1Z5o3deBuFrqVjBVmmqto"),
  Mine: new PublicKey("QMNeHCGYnLVDn1icRAfQZpjPLBNkfGbSKRB83G5d8KB"),
  MintWrapper: new PublicKey("QMWoBmAyJLAsA1Lh9ugMTw2gciTihncciphzdNzdZYV"),
  Operator: new PublicKey("QoP6NfrQbaGnccXQrMLUkog2tQZ4C1RFgJcwDnT8Kmz"),
  Redeemer: new PublicKey("QRDxhMw1P2NEfiw5mYXG79bwfgHTdasY2xNP76XSea9"),
  Registry: new PublicKey("QREGBnEj9Sa5uR91AV8u3FxThgP5ZCvdZUW2bHAkfNc"),
};

const findMintWrapperAddress = async (
  base: PublicKey,
  programID: PublicKey = QUARRY_ADDRESSES.MintWrapper
): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [Buffer.from(utils.bytes.utf8.encode("MintWrapper")), base.toBytes()],
    programID
  );
};

const findMinterAddress = async (
  wrapper: PublicKey,
  authority: PublicKey,
  programID: PublicKey = QUARRY_ADDRESSES.MintWrapper
): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [
      Buffer.from(utils.bytes.utf8.encode("MintWrapperMinter")),
      wrapper.toBytes(),
      authority.toBytes(),
    ],
    programID
  );
};
