use anchor_lang::prelude::*;
use quarry_mint_wrapper::cpi::accounts::*;
use quarry_mint_wrapper::program::QuarryMintWrapper;
use quarry_mint_wrapper::MintWrapper;

use quarry_mine::cpi::accounts::*;
use quarry_mine::program::QuarryMine;
use quarry_mine::{Quarry, Miner, Rewarder};
use anchor_spl::token::{Mint, TokenAccount, Token};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod quarry_test {
    use super::*;
    
    pub fn new_mint_wrapper(ctx: Context<NewMintWrapperCPI>, hard_cap: u64) -> Result<()> {
        let cpi_program = ctx.accounts.mint_wrapper_program.to_account_info();
        let cpi_accounts = quarry_mint_wrapper::cpi::accounts::NewWrapper {
            base: ctx.accounts.base.to_account_info().clone(),
            mint_wrapper: ctx.accounts.mint_wrapper.to_account_info().clone(),
            admin: ctx.accounts.admin.to_account_info().clone(),
            token_mint: ctx.accounts.token_mint.to_account_info().clone(),
            token_program: ctx.accounts.token_program.to_account_info().clone(),
            payer: ctx.accounts.payer.to_account_info().clone(),
            system_program: ctx.accounts.system_program.to_account_info().clone(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        quarry_mint_wrapper::cpi::new_wrapper_v2(cpi_ctx, hard_cap)?;
        Ok(())
    }

    pub fn create_miner(ctx: Context<CreateMinerCPI>) -> Result<()> {
        let cpi_program = ctx.accounts.mine_program.to_account_info();
        let cpi_accounts = quarry_mine::cpi::accounts::CreateMiner {
            authority: ctx.accounts.authority.to_account_info(),
            miner: ctx.accounts.miner.to_account_info(),
            quarry: ctx.accounts.quarry.to_account_info(),
            rewarder: ctx.accounts.rewarder.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            payer: ctx.accounts.payer.to_account_info(),
            token_mint: ctx.accounts.token_mint.to_account_info(),
            miner_vault: ctx.accounts.miner_vault.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        quarry_mine::cpi::create_miner_v2(cpi_ctx)?;
        Ok(())
    }

    pub fn stake_tokens(ctx: Context<StakeTokensCPI>, amt: u64) -> Result<()> {
        let cpi_program = ctx.accounts.mine_program.to_account_info();
        let cpi_accounts = quarry_mine::cpi::accounts::UserStake {
            authority: ctx.accounts.authority.to_account_info(),
            miner: ctx.accounts.miner.to_account_info(),
            quarry: ctx.accounts.quarry.to_account_info(),
            miner_vault: ctx.accounts.miner_vault.to_account_info(),
            token_account: ctx.accounts.token_account.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            rewarder: ctx.accounts.rewarder.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        quarry_mine::cpi::stake_tokens(cpi_ctx, amt)?;
        Ok(())
    }

    pub fn create_rewarder(ctx: Context<CreateRewarderCPI>) -> Result<()> {
        let cpi_program = ctx.accounts.mine_program.to_account_info();
        let cpi_accounts = quarry_mine::cpi::accounts::NewRewarderV2 {
            base: ctx.accounts.base.to_account_info(),
            rewarder: ctx.accounts.rewarder.to_account_info(),
            initial_authority: ctx.accounts.initial_authority.to_account_info(),
            payer: ctx.accounts.payer.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            mint_wrapper: ctx.accounts.system_program.to_account_info(),
            rewards_token_mint: ctx.accounts.rewards_token_mint.to_account_info(),
            claim_fee_token_account: ctx.accounts.claim_fee_token_account.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        quarry_mine::cpi::new_rewarder_v2(cpi_ctx)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct NewMintWrapperCPI<'info> {
    /// CHECK: check
    #[account(signer)]
    pub base: AccountInfo<'info>,
    /// CHECK: check
    #[account(mut)]
    pub mint_wrapper: AccountInfo<'info>,
    /// CHECK: check
    pub admin: AccountInfo<'info>,
    /// CHECK: check
    pub token_mint: AccountInfo<'info>,
    /// CHECK: check
    pub token_program: AccountInfo<'info>,
    /// CHECK: check
    #[account(mut)]
    pub payer: AccountInfo<'info>,
    /// CHECK: check
    pub system_program: AccountInfo<'info>,
    /// CHECK: check
    pub mint_wrapper_program: Program<'info, QuarryMintWrapper>,
}

#[derive(Accounts)]
pub struct CreateMinerCPI<'info> {
    /// CHECK: check
    pub authority: Signer<'info>,
    /// CHECK: check
    pub miner: Box<Account<'info, Miner>>,
    /// CHECK: check
    pub mine_program: Program<'info, QuarryMine>,
    /// CHECK: check
    pub quarry: Box<Account<'info, Quarry>>,
    /// CHECK: check
    pub rewarder: Box<Account<'info, Rewarder>>,
    /// CHECK: check
    pub system_program: Program<'info, System>,
    /// CHECK: check
    pub payer: Signer<'info>,
    /// CHECK: check
    pub token_mint: Account<'info, Mint>,
    /// CHECK: check
    pub miner_vault: Account<'info, TokenAccount>,
    /// CHECK: check
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct StakeTokensCPI<'info> {
    /// CHECK: check
    pub authority: AccountInfo<'info>,
    /// CHECK: check
    pub miner: AccountInfo<'info>,
    /// CHECK: check
    pub quarry: AccountInfo<'info>,
    /// CHECK: check
    pub miner_vault: AccountInfo<'info>,
    /// CHECK: check
    pub token_account: AccountInfo<'info>,
    /// CHECK: check
    pub token_program: AccountInfo<'info>,
    /// CHECK: check
    pub rewarder: AccountInfo<'info>,
    /// CHECK: check
    pub mine_program: Program<'info, QuarryMine>,
}

#[derive(Accounts)]
pub struct CreateRewarderCPI<'info> {
    /// CHECK: check
    pub base: AccountInfo<'info>,
    /// CHECK: check
    pub rewarder: AccountInfo<'info>,
    /// CHECK: check
    pub initial_authority: AccountInfo<'info>,
    /// CHECK: check
    pub payer: AccountInfo<'info>,
    /// CHECK: check
    pub system_program: AccountInfo<'info>,
    /// CHECK: check
    pub mint_wrapper: AccountInfo<'info>,
    /// CHECK: check
    pub rewards_token_mint: AccountInfo<'info>,
    /// CHECK: check
    pub claim_fee_token_account: AccountInfo<'info>,
    /// CHECK: check
    pub mine_program: Program<'info, QuarryMine>,
}
