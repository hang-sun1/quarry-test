import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { QuarryTest } from "../target/types/quarry_test";
import { expectTX, assertTXSuccess } from "@saberhq/chai-solana";
import { SolanaProvider } from "@saberhq/solana-contrib";

import { MintWrapper, MintWrapperProgram, QuarrySDK } from "@quarryprotocol/quarry-sdk"
// import makeSDK from "@quarryprotocol/quarry-sdk"
import type { Provider } from "@saberhq/solana-contrib"
import type { PublicKey } from "@solana/web3.js";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as assert from "assert";
import { expect } from "chai";
import "chai"
import "chai-as-promised"
import {
  createInitMintInstructions,
  DEFAULT_TOKEN_DECIMALS,
  getMintInfo,
  Token,
  TokenAmount,
  u64,
} from "@saberhq/token-utils";
import chaiAsPromised from "chai-as-promised";
import chai from "chai"
chai.use(chaiAsPromised);
chai.should();

describe("quarry sdk testing", () => {
  const { BN, web3 } = anchor;
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  let sdk: QuarrySDK;
  let provider: Provider;
  let mintWrapper: MintWrapper;
  let MintWrapper: MintWrapperProgram;

  const program = anchor.workspace.QuarryTest as Program<QuarryTest>;
  before("Initialize SDK", () => {
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
    mintWrapper = sdk.mintWrapper;
    MintWrapper = sdk.programs.MintWrapper;
  });


  let rewardsMint: PublicKey;
  let token: Token;
  let mintWrapperKey: PublicKey;
  let hardCap: TokenAmount;

  beforeEach("Initialize Mint", async () => {
    const rewardsMintKP = Keypair.generate();
    rewardsMint = rewardsMintKP.publicKey;
    token = Token.fromMint(rewardsMint, DEFAULT_TOKEN_DECIMALS);
    hardCap = TokenAmount.parse(token, (1_000_000_000_000).toString());

    const { tx, mintWrapper: wrapperKey } = await mintWrapper.newWrapper({
      hardcap: hardCap.toU64(),
      tokenMint: rewardsMint,
    });

    await expectTX(await createInitMintInstructions({
      provider,
      mintKP: rewardsMintKP,
      decimals: DEFAULT_TOKEN_DECIMALS,
      mintAuthority: wrapperKey,
      freezeAuthority: wrapperKey,
    })).to.be.fulfilled;

    mintWrapperKey = wrapperKey;

    await expectTX(tx, "Initialize mint").to.be.fulfilled;
  })

  it("init mint wrapper v1", async () => {
    const { tx } = await mintWrapper.newWrapperAndMintV1({
      hardcap: hardCap.toU64(),
    });
    await assertTXSuccess(tx, "init mint wrapper v1");
  });

  it("Check MintWrapper", async () => {
    const mintInfo = await getMintInfo(provider, rewardsMint);
    assert.ok(mintInfo.mintAuthority?.equals(mintWrapperKey));

  });

  describe("MintWrapper", () => {
    it("Transfer admin authority and accept admin authority", async () => {
      const newAuthority = web3.Keypair.generate();

      await assert.doesNotReject(async () => {
        await MintWrapper.rpc.transferAdmin({
          accounts: {
            mintWrapper: mintWrapperKey,
            admin: provider.wallet.publicKey,
            nextAdmin: newAuthority.publicKey,
          },
        });
      });

      let mintWrapperState =
        await mintWrapper.program.account.mintWrapper.fetch(mintWrapperKey);

      const ix = mintWrapper.program.instruction.acceptAdmin({
        accounts: {
          mintWrapper: mintWrapperKey,
          pendingAdmin: newAuthority.publicKey,
        },
      });
      let tx = sdk.newTx([ix], [newAuthority]);
      await expectTX(tx, "transfer authority").to.be.fulfilled;
      mintWrapperState = await mintWrapper.program.account.mintWrapper.fetch(
        mintWrapperKey
      );

      // Transfer back
      const instructions = [];
      instructions.push(
        mintWrapper.program.instruction.transferAdmin({
          accounts: {
            mintWrapper: mintWrapperKey,
            admin: newAuthority.publicKey,
            nextAdmin: provider.wallet.publicKey,
          },
        })
      );
      instructions.push(
        mintWrapper.program.instruction.acceptAdmin({
          accounts: {
            mintWrapper: mintWrapperKey,
            pendingAdmin: provider.wallet.publicKey,
          },
        })
      );

      tx = sdk.newTx(instructions, [newAuthority]);
      await expectTX(tx, "transfer authority back to original authority").to.be
        .fulfilled;

      mintWrapperState = await mintWrapper.program.account.mintWrapper.fetch(
        mintWrapperKey
      );
    });
  });

  it("new minter v1", async () => {
    const id = Keypair.generate().publicKey;
    await expectTX(
      mintWrapper.newMinterV1(mintWrapperKey, id),
      "new minter v1"
    ).to.be.fulfilled;
  });

  it("Adds a Minter", async () => {
    const allowance = new u64(1_000_000);
    const id = Keypair.generate().publicKey;

    await expectTX(
      mintWrapper.newMinterWithAllowance(mintWrapperKey, id, allowance),
      "add minter"
    ).to.be.fulfilled;
  });

  it("Removes a Minter", async () => {
    const allowance = new u64(1_000_000);
    const id = Keypair.generate().publicKey;
    await expectTX(
      mintWrapper.newMinterWithAllowance(mintWrapperKey, id, allowance),
      "add minter"
    ).to.be.fulfilled;

    await expectTX(
      mintWrapper.minterUpdate(mintWrapperKey, id, new u64(0)),
      "remove minter"
    ).to.be.fulfilled;
  });


  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});