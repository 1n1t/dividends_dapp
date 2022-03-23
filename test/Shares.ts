import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Shares } from '../typechain/Shares';

const SHARES = { first: 80, second: 20 };

let contractToken: Shares;

beforeEach(async () => {
    const Shares = await ethers.getContractFactory('Shares');
    contractToken = await Shares.deploy(SHARES.first + SHARES.second, 10);
    await contractToken.deployed();
});

describe('Shares', function () {
    describe('deploy', () => {
        it('will not deploy contract with invalid share amount', async () => {
            const Shares = await ethers.getContractFactory('Shares');
            await expect(Shares.deploy(1, 10)).to.be.revertedWith('Total number of shares should be greater than 1');
        });

        it('will not deploy contract with invalid max stakeholders number', async () => {
            const Shares = await ethers.getContractFactory('Shares');
            await expect(Shares.deploy(100, 30)).to.be.revertedWith('Maximum allowed stakeholders exceeded');
        });
    });

    describe('dividends', () => {
        it('should add dividends to the contract', async function () {
            const { firstAccount, secondAccount } = await getAccounts();

            await contractToken.registerShares(firstAccount.address, SHARES.first);
            await contractToken.registerShares(secondAccount.address, SHARES.second);

            let tr = await depositDividends(10_000);
            await expect(tr).to.emit(contractToken, 'DividendsReceived').withArgs(10_000);

            let dividends = await contractToken.getTotalBalance();
            expect(dividends).to.equal(10_000);

            tr = await depositDividends(10_000);
            await expect(tr).to.emit(contractToken, 'DividendsReceived').withArgs(10_000);

            dividends = await contractToken.getTotalBalance();
            expect(dividends).to.equal(20_000);
        });

        it('will add dividends only if there is more than one stakeholder', async () => {
            const { firstAccount } = await getAccounts();

            let tr = depositDividends(10_000);
            await expect(tr).to.be.revertedWith('There is not enough stakeholders yet');

            await contractToken.registerShares(firstAccount.address, SHARES.first);

            tr = depositDividends(10_000);
            await expect(tr).to.be.revertedWith('There is not enough stakeholders yet');
        });

        describe('initial claim', () => {
            it('stakeholder should be able to claim dividends', async function () {
                const { secondAccount } = await registerAccountsAndAddDividends();
                const tx = await contractToken.connect(secondAccount).claimDividends();

                expect(tx)
                    .to.emit(contractToken, 'DividendsReleased')
                    .withArgs(secondAccount.address, 2_000);

                expect(tx).to.changeEtherBalance(secondAccount, 2_000);
            });

            it('will not release dividends if stakeholder has already claimed all available amount', async () => {
                const { secondAccount } = await registerAccountsAndAddDividends();
                await contractToken.connect(secondAccount).claimDividends();

                await expect(contractToken.connect(secondAccount).claimDividends()).to.be.revertedWith('No dividends to pay');
            });

            it('will not pay dividends to unknown stakeholder', async () => {
                const { firstAccount, secondAccount } = await getAccounts();

                await contractToken.registerShares(firstAccount.address, SHARES.first);
                await contractToken.registerShares(secondAccount.address, SHARES.second);
                await depositDividends(10_000);

                await expect(contractToken.claimDividends()).to.be.revertedWith('There is no such stakeholder');
            });
        });

        describe('subsequent claims', () => {
            it('send correct amount on the second claim for the same address', async () => {
                const { secondAccount } = await registerAccountsAndAddDividends();

                await contractToken.connect(secondAccount).claimDividends();
                await depositDividends(5_000);

                const tx = await contractToken.connect(secondAccount).claimDividends();
                expect(tx).to.emit(contractToken, 'DividendsReleased').withArgs(secondAccount.address, 1_000);

                expect(tx).to.changeEtherBalance(secondAccount, 1_000);
            });

            it('send correct amount on the second claim for another address', async () => {
                const { firstAccount, secondAccount } = await registerAccountsAndAddDividends();

                await contractToken.connect(secondAccount).claimDividends();
                await depositDividends(5_000);

                const tx = await contractToken.connect(firstAccount).claimDividends();
                expect(tx).to.emit(contractToken, 'DividendsReleased').withArgs(firstAccount.address, 12_000);

                expect(tx).to.changeEtherBalance(secondAccount, 12_000);
            });

            it('will empty the pool when all dividends are paid', async () => {
                const { firstAccount, secondAccount } = await registerAccountsAndAddDividends();

                await contractToken.connect(firstAccount).claimDividends();
                await depositDividends(5_000);
                await contractToken.connect(secondAccount).claimDividends();
                await contractToken.connect(firstAccount).claimDividends();

                const balance = await contractToken.getTotalBalance();
                expect(balance).to.equal(0);
            });
        });

        describe('when shares allocation changes by adding a new stakeholder', () => {
            beforeEach(async() => {
                const { firstAccount, secondAccount, thirdAccount } = await getAccounts();

                await contractToken.registerShares(firstAccount.address, 10);
                await contractToken.registerShares(secondAccount.address, 40);
                await depositDividends(10_000);
                await contractToken.connect(firstAccount).claimDividends();
                await depositDividends(5_000);
                await contractToken.registerShares(thirdAccount.address, 20);
            });

            describe('and no dividends are added after that', () => {
                it('calculates correct unclaimed amounts for each stakeholder and rest of the balance is correct', async() => {
                    const { firstAccount, secondAccount, thirdAccount } = await getAccounts();
    
                    const tx1 = await contractToken.connect(firstAccount).claimDividends();
                    await expect(tx1).to.emit(contractToken, 'DividendsReleased').withArgs(firstAccount.address, 500);
                    await expect(tx1).to.changeEtherBalance(firstAccount, 500);
    
                    const tx2 = await contractToken.connect(secondAccount).claimDividends();
                    await expect(tx2).to.emit(contractToken, 'DividendsReleased').withArgs(secondAccount.address, 6_000);
                    await expect(tx2).to.changeEtherBalance(secondAccount, 6_000);
    
                    const tx3 = contractToken.connect(thirdAccount).claimDividends();
                    await expect(tx3).to.be.revertedWith('No dividends to pay');

                    const balance = await contractToken.getTotalBalance();
                    expect(balance).to.equal(7_500);
                });
            });

            describe('and new dividends is added after that', () => {
                beforeEach(async() => {
                    const { firstAccount } = await getAccounts();
                    await depositDividends(5_000);
                    await contractToken.connect(firstAccount).claimDividends();
                    await depositDividends(10_000);
                })
            
                it('calculates correct unclaimed amounts for each stakeholder and rest of the balance is correct', async() => {
                    const { firstAccount, secondAccount, thirdAccount } = await getAccounts();
                    const tx1 = await contractToken.connect(firstAccount).claimDividends();
                    await expect(tx1).to.emit(contractToken, 'DividendsReleased').withArgs(firstAccount.address, 1_000);
                    await expect(tx1).to.changeEtherBalance(firstAccount, 1_000);

                    const tx2 = await contractToken.connect(secondAccount).claimDividends();
                    await expect(tx2).to.emit(contractToken, 'DividendsReleased').withArgs(secondAccount.address, 12_000);
                    await expect(tx2).to.changeEtherBalance(secondAccount, 12_000);

                    const tx3 = await contractToken.connect(thirdAccount).claimDividends();
                    await expect(tx3).to.emit(contractToken, 'DividendsReleased').withArgs(thirdAccount.address, 3_000);
                    await expect(tx3).to.changeEtherBalance(thirdAccount, 3_000);

                    const balance = await contractToken.getTotalBalance();
                    expect(balance).to.equal(12_000);
                });
            });
        });

        describe('when shares allocation changes by altering shares of existing stakeholder', () => {
            beforeEach(async () => {
                const { firstAccount, secondAccount } = await getAccounts();
                await contractToken.registerShares(firstAccount.address, 10);
                await contractToken.registerShares(secondAccount.address, 40);
                await depositDividends(10_000);

                await contractToken.connect(firstAccount).claimDividends();
                await depositDividends(5_000);

                await contractToken.registerShares(firstAccount.address, 20);
                await depositDividends(5_000);
            });

            it('calculates correct unclaimed amounts for each stakeholder and rest of the balance is correct', async () => {
                const { firstAccount, secondAccount } = await getAccounts();
                
                const tx11 = await contractToken.connect(firstAccount).claimDividends();
                await expect(tx11).to.emit(contractToken, 'DividendsReleased').withArgs(firstAccount.address, 1_500);
                await expect(tx11).to.changeEtherBalance(firstAccount, 1_500);

                await depositDividends(10_000);

                const tx12 = await contractToken.connect(firstAccount).claimDividends();
                await expect(tx12).to.emit(contractToken, 'DividendsReleased').withArgs(firstAccount.address, 2_000);
                await expect(tx12).to.changeEtherBalance(firstAccount, 2_000);

                const tx2 = await contractToken.connect(secondAccount).claimDividends();
                await expect(tx2).to.emit(contractToken, 'DividendsReleased').withArgs(secondAccount.address, 12_000);
                await expect(tx2).to.changeEtherBalance(secondAccount, 12_000);

                const balance = await contractToken.getTotalBalance();
                expect(balance).to.equal(13_500);
            });
        });

        describe('undistributed dividends', () => {
            it('are tracked correctly', async() => {
                const { firstAccount, secondAccount } = await getAccounts();
                await contractToken.registerShares(firstAccount.address, 10);
                await contractToken.registerShares(secondAccount.address, 40);
    
                let undistributedTotal = await contractToken.getUndistributedDividends();
                expect(undistributedTotal).to.equal(0);
    
                await depositDividends(10_000);
                undistributedTotal = await contractToken.getUndistributedDividends();
                expect(undistributedTotal).to.equal(5_000);
                
                
                await contractToken.registerShares(firstAccount.address, 30);
                await depositDividends(20_000);
                undistributedTotal = await contractToken.getUndistributedDividends();
                expect(undistributedTotal).to.equal(11_000);
            });
        });

    });

    describe('shares', () => {
        it('should register a new stakeholder', async () => {
            const { firstAccount, secondAccount } = await getAccounts();

            await expect(contractToken.registerShares(firstAccount.address, SHARES.first))
                .to.emit(contractToken, 'StakeholderRegistered')
                .withArgs(firstAccount.address, SHARES.first);

            await contractToken.registerShares(secondAccount.address, SHARES.second);

            expect(await contractToken.connect(firstAccount).getStakeholderShares()).to.equal(SHARES.first);
            expect(await contractToken.connect(secondAccount).getStakeholderShares()).to.equal(SHARES.second);
            expect(await contractToken.getSoldShares()).to.equal(SHARES.first + SHARES.second);
        });

        it('not owner cannot register a new stakeholder', async () => {
            const { firstAccount } = await getAccounts();

            await expect(contractToken.connect(firstAccount).registerShares(firstAccount.address, SHARES.first)).to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('should replace shares for existing stakeholder', async () => {
            const { firstAccount } = await getAccounts();

            await contractToken.registerShares(firstAccount.address, SHARES.first);
            await expect(contractToken.registerShares(firstAccount.address, SHARES.second))
                .to.emit(contractToken, 'StakeholdersShareChanged')
                .withArgs(firstAccount.address, SHARES.second);

            expect(await contractToken.connect(firstAccount).getStakeholderShares()).to.equal(SHARES.second);
            expect(await contractToken.getSoldShares()).to.equal(SHARES.second);
        });

        it('should not register a stakeholder with empty share', async () => {
            const { firstAccount } = await getAccounts();

            await expect(contractToken.registerShares(firstAccount.address, 0)).to.be.revertedWith('Shares cannot be zero');
        });

        it('will not show shares info to unauthorized account', async () => {
            const { firstAccount } = await getAccounts();

            await contractToken.registerShares(firstAccount.address, SHARES.first);

            await expect(contractToken.getStakeholderShares()).to.be.revertedWith('There is no such stakeholder');

            const shares = await contractToken.connect(firstAccount).getStakeholderShares();
            expect(shares).to.equal(SHARES.first);
        });

        it('owner cannot register himself as a stakeholder', async () => {
            const { owner } = await getAccounts();

            await expect(contractToken.registerShares(owner.address, 1)).to.be.revertedWith('Cannot register shares for the contract owner');
        });
    });
});

async function getAccounts() {
    const [ owner, firstAccount, secondAccount, thirdAccount ] = await ethers.getSigners();
    return { owner, firstAccount, secondAccount, thirdAccount };
}

async function depositDividends(value: number) {
    const { owner } = await getAccounts();
    return await owner.sendTransaction({ to: contractToken.address, value });
}

async function registerAccountsAndAddDividends() {
    const { owner, firstAccount, secondAccount } = await getAccounts();

    await contractToken.registerShares(firstAccount.address, SHARES.first);
    await contractToken.registerShares(secondAccount.address, SHARES.second);
    await depositDividends(10_000);

    return { owner, firstAccount, secondAccount };
}
