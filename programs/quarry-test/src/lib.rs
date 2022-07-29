use anchor_lang::prelude::*;
use quarry_mint_wrapper::cpi::accounts::*;
use quarry_mint_wrapper::program::QuarryMintWrapper;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod quarry_test {
    use super::*;
    
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {

        Ok(())
    }


    pub fn NewMintWrapper(ctx: Context<NewMintWrapperCPI>) -> Result<()> {
        let cpi_program = ctx.accounts.mint_wrapper_program.to_account_info();
        let cpi_accounts = quarry_mint_wrapper::cpi::accounts::NewWrapper {

        };

        quarry_mint_wrapper::cpi::new_wrapper()?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {

}

#[derive(Accounts)]
pub struct NewMintWrapperCPI<'info> {
    pub mint_wrapper_program: Program<'info, QuarryMintWrapper>,
    // pub mint_wrapper: Account<'info, >,
}

#[derive(Accounts)]
pub struct QuarryMintCPI<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,

    /// CHECK: check
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,

    /// CHECK: check
    #[account(mut)]
    pub position: UncheckedAccount<'info>,

    #[account(mut)]
    pub position_mint: Signer<'info>,
    
    /// CHECK: check
    #[account(mut)]
    pub position_token_account: AccountInfo<'info>,

    // #[account(mut)]
    // pub quarry_mint_wrapper: Box<Account<'info, quarry_mint_wrapper::cpi::
}
