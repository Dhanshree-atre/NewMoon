// Print the wallet address for a Midnight network (and, if present, its recovery phrase).
// Usage: npx tsx scripts/preview-address.ts [--network preview|preprod]
import { Buffer } from 'buffer';
import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice } from '../src/network';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { HDWallet, Roles, createKeystore } from '@midnight-ntwrk/wallet-sdk';

const networkFlag = process.argv[process.argv.indexOf('--network') + 1] ?? 'preview';
const { network, config } = resolveNetwork({ argv: ['', '', '--network', networkFlag] });
setNetworkId(config.networkId);

const wallet = getOrCreateWallet(network);
const notice = formatWalletBackupNotice(wallet, network);
if (notice) console.log(notice);

const hdWallet = HDWallet.fromSeed(Buffer.from(wallet.seed, 'hex'));
if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');
const keys = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.NightExternal])
  .deriveKeysAt(0);
hdWallet.hdWallet.clear();
if (keys.type !== 'keysDerived') throw new Error('Key derivation failed');

const keystore = createKeystore(keys.keys[Roles.NightExternal], config.networkId);
console.log(`${network} wallet address: ${keystore.getBech32Address().toString()}`);
console.log(`Seed (hex):            ${wallet.seed}`);
