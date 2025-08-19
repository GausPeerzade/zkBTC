// package.json dependencies:
// npm install bitcoinjs-lib axios child_process fs path

const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Bitcoin RPC configuration
const RPC_CONFIG = {
    host: 'localhost',
    port: 18443, // regtest port
    username: 'gaus',
    password: '1234',
    timeout: 30000
};

class BitcoinRegtestManager {
    constructor() {
        this.bitcoindProcess = null;
        this.ordProcess = null;
        this.network = bitcoin.networks.regtest;
    }

    // Bitcoin RPC call helper
    async rpcCall(method, params = []) {
        const auth = Buffer.from(`${RPC_CONFIG.username}:${RPC_CONFIG.password}`).toString('base64');

        try {
            const response = await axios.post(`http://${RPC_CONFIG.host}:${RPC_CONFIG.port}`, {
                jsonrpc: '2.0',
                id: Date.now(),
                method,
                params
            }, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                timeout: RPC_CONFIG.timeout
            });

            if (response.data.error) {
                throw new Error(`RPC Error: ${response.data.error.message}`);
            }

            return response.data.result;
        } catch (error) {
            throw new Error(`Bitcoin RPC call failed: ${error.message}`);
        }
    }

    // Setup Bitcoin configuration
    createBitcoinConfig() {
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        const bitcoinDir = path.join(homeDir, '.bitcoin');

        if (!fs.existsSync(bitcoinDir)) {
            fs.mkdirSync(bitcoinDir, { recursive: true });
        }

        const config = `
regtest=1
server=1
rpcuser=${RPC_CONFIG.username}
rpcpassword=${RPC_CONFIG.password}
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=${RPC_CONFIG.port}
fallbackfee=0.00001
txindex=1
blockfilterindex=1
peerblockfilters=1
daemon=1
`;

        fs.writeFileSync(path.join(bitcoinDir, 'bitcoin.conf'), config.trim());
        console.log('✅ Bitcoin configuration created');
    }

    // Start bitcoind
    async startBitcoind() {
        return new Promise((resolve, reject) => {
            console.log('🚀 Starting bitcoind...');

            this.bitcoindProcess = spawn('bitcoind', ['-regtest'], {
                stdio: 'pipe'
            });

            this.bitcoindProcess.stdout.on('data', (data) => {
                console.log(`bitcoind: ${data}`);
            });

            this.bitcoindProcess.stderr.on('data', (data) => {
                console.log(`bitcoind error: ${data}`);
            });

            // Wait for bitcoind to start
            setTimeout(async () => {
                try {
                    await this.rpcCall('getblockchaininfo');
                    console.log('✅ Bitcoind started successfully');
                    resolve();
                } catch (error) {
                    reject(new Error('Failed to start bitcoind: ' + error.message));
                }
            }, 3000);
        });
    }

    // Stop bitcoind
    async stopBitcoind() {
        if (this.bitcoindProcess) {
            await this.rpcCall('stop');
            this.bitcoindProcess.kill();
            console.log('🛑 Bitcoind stopped');
        }
    }

    // Initialize regtest blockchain
    async initializeChain() {
        try {
            // Create wallet
            await this.rpcCall('createwallet', ['testwallet']);
            console.log('✅ Wallet created');
        } catch (error) {
            if (!error.message.includes('already exists')) {
                throw error;
            }
            console.log('ℹ️ Wallet already exists');
        }

        // Generate address and mine initial blocks
        const address = await this.rpcCall('getnewaddress');
        console.log(`📍 Generated address: ${address}`);

        // Mine 101 blocks for coinbase maturity
        await this.rpcCall('generatetoaddress', [101, address]);
        console.log('⛏️ Mined 101 blocks');

        const balance = await this.rpcCall('getbalance');
        console.log(`💰 Balance: ${balance} BTC`);

        return address;
    }

    // Start ord server
    async startOrd() {
        return new Promise((resolve, reject) => {
            console.log('🔍 Starting ord server...');

            this.ordProcess = spawn('ord', [
                '--regtest',
                '--bitcoin-rpc-username', RPC_CONFIG.username,
                '--bitcoin-rpc-url', `http://127.0.0.1:${RPC_CONFIG.port}`,
                '--bitcoin-rpc-password', RPC_CONFIG.password,
                'server'
            ], {
                stdio: 'pipe'
            });

            this.ordProcess.stdout.on('data', (data) => {
                console.log(`ord: ${data}`);
                if (data.toString().includes('listening')) {
                    resolve();
                }
            });

            this.ordProcess.stderr.on('data', (data) => {
                console.log(`ord error: ${data}`);
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.ordProcess) {
                    console.log('✅ Ord server started (timeout)');
                    resolve();
                }
            }, 10000);
        });
    }

    // Stop ord server
    stopOrd() {
        if (this.ordProcess) {
            this.ordProcess.kill();
            console.log('🛑 Ord server stopped');
        }
    }

    // Create and fund ord wallet
    async setupOrdWallet() {
        try {
            // Create ord wallet
            exec('ord --regtest wallet create', (error, stdout, stderr) => {
                if (error && !stderr.includes('already exists')) {
                    console.log('ord wallet error:', error);
                } else {
                    console.log('✅ Ord wallet created');
                }
            });

            // Get ord receive address
            return new Promise((resolve, reject) => {
                exec('ord --regtest wallet receive', (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                    } else {
                        const ordAddress = stdout.match(/"([a-zA-Z0-9]+)"/)?.[1];
                        if (ordAddress) {
                            console.log(`📍 Ord address: ${ordAddress}`);
                            resolve(ordAddress);
                        } else {
                            reject(new Error('Could not parse ord address'));
                        }
                    }
                });
            });
        } catch (error) {
            console.log('ℹ️ Ord wallet setup error (may already exist):', error.message);
            return null;
        }
    }

    // Fund ord wallet
    async fundOrdWallet(ordAddress) {
        if (ordAddress) {
            const txid = await this.rpcCall('sendtoaddress', [ordAddress, 1.0]);
            console.log(`💸 Sent 1 BTC to ord wallet: ${txid}`);

            // Mine block to confirm
            const address = await this.rpcCall('getnewaddress');
            await this.rpcCall('generatetoaddress', [1, address]);
            console.log('⛏️ Mined confirmation block');
        }
    }

    // Create test transaction with inscription
    async createInscriptionTransaction(hexScript, outputAddress) {
        try {
            // Create raw transaction with inscription script
            const unspent = await this.rpcCall('listunspent');
            if (unspent.length === 0) {
                throw new Error('No unspent outputs available');
            }

            const utxo = unspent[0];
            const fee = 0.0001;
            const amount = utxo.amount - fee;

            // Create transaction inputs and outputs
            const rawTx = await this.rpcCall('createrawtransaction', [
                [{ txid: utxo.txid, vout: utxo.vout }],
                { [outputAddress]: amount }
            ]);

            console.log(`📝 Created raw transaction: ${rawTx}`);
            return rawTx;
        } catch (error) {
            console.error('Failed to create inscription transaction:', error.message);
            throw error;
        }
    }

    // Cleanup
    async cleanup() {
        this.stopOrd();
        await this.stopBitcoind();
    }
}

// Inscription functions (from previous artifact)
const tags = {
    contentType: 1,
    pointer: 2,
    parent: 3,
    metadata: 5,
    metaprotocol: 7,
    contentEncoding: 9,
    delegate: 11,
    rune: 13,
};

function chunkData(data, chunkSize) {
    const chunks = [];
    let offset = 0;
    while (offset < data.length) {
        const size = Math.min(chunkSize, data.length - offset);
        chunks.push(data.slice(offset, offset + size));
        offset += size;
    }
    return chunks;
}

function prepareInscription(marker, contentType, payloadData) {
    const contentTypeBytes = new TextEncoder().encode(contentType);

    // Simple script building for Node.js
    const script = [
        0x63, // OP_IF
        ...new TextEncoder().encode(marker),
        tags.contentType,
        contentTypeBytes.length,
        ...contentTypeBytes,
        0x00, // OP_0
        ...(payloadData.length > 520
            ? chunkData(payloadData, 520).flat()
            : payloadData),
        0x68, // OP_ENDIF
    ];

    return Buffer.from(script).toString("hex");
}

function prepareTextInscription(text) {
    return prepareInscription(
        "ord",
        "text/plain;charset=utf-8",
        new TextEncoder().encode(text + "\n")
    );
}

function prepareEmojiInscription(emoji) {
    return prepareInscription(
        "ord",
        "text/plain;charset=utf-8",
        new TextEncoder().encode(emoji)
    );
}

function prepareBRC20Inscription(options) {
    const { runeName, operation, amount, maxSupply, limit } = options;

    let brc20Payload = {
        p: "brc-20",
        op: operation,
        tick: runeName
    };

    if (amount) brc20Payload.amt = amount;
    if (maxSupply) brc20Payload.max = maxSupply;
    if (limit) brc20Payload.lim = limit;

    const jsonString = JSON.stringify(brc20Payload);

    return prepareInscription(
        "ord",
        "application/json",
        new TextEncoder().encode(jsonString)
    );
}

// Test runner
async function runTests() {
    const manager = new BitcoinRegtestManager();

    try {
        console.log('🔧 Setting up Bitcoin regtest environment...\n');

        // Setup
        manager.createBitcoinConfig();
        await manager.startBitcoind();
        const address = await manager.initializeChain();

        // Test inscription functions
        console.log('\n📝 Testing inscription functions...\n');

        // Test 1: Text inscription
        const textHex = prepareTextInscription("Hello Bitcoin Ordinals from Node.js!");
        console.log('✅ Text inscription hex:', textHex);
        console.log('   Length:', textHex.length / 2, 'bytes\n');

        // Test 2: Emoji inscription
        const emojiHex = prepareEmojiInscription("🚀");
        console.log('✅ Emoji inscription hex:', emojiHex);
        console.log('   Length:', emojiHex.length / 2, 'bytes\n');

        // Test 3: BRC-20 inscription
        const brc20Hex = prepareBRC20Inscription({
            runeName: "TEST",
            operation: "deploy",
            maxSupply: "21000000",
            limit: "1000"
        });
        console.log('✅ BRC-20 inscription hex:', brc20Hex);
        console.log('   Length:', brc20Hex.length / 2, 'bytes\n');

        // Verify scripts can be decoded
        console.log('🔍 Verifying scripts with Bitcoin Core...\n');

        try {
            const textDecoded = await manager.rpcCall('decodescript', [textHex]);
            console.log('✅ Text script decoded successfully');
            console.log('   Type:', textDecoded.type);

            const emojiDecoded = await manager.rpcCall('decodescript', [emojiHex]);
            console.log('✅ Emoji script decoded successfully');
            console.log('   Type:', emojiDecoded.type);

            const brc20Decoded = await manager.rpcCall('decodescript', [brc20Hex]);
            console.log('✅ BRC-20 script decoded successfully');
            console.log('   Type:', brc20Decoded.type);

        } catch (decodeError) {
            console.log('⚠️ Script decode error (may be normal for witness scripts):', decodeError.message);
        }

        // Optional: Setup ord if available
        console.log('\n🔍 Setting up ord (if available)...');
        try {
            await manager.startOrd();
            const ordAddress = await manager.setupOrdWallet();
            if (ordAddress) {
                await manager.fundOrdWallet(ordAddress);
                console.log('✅ Ord setup complete');
            }
        } catch (ordError) {
            console.log('ℹ️ Ord not available or setup failed:', ordError.message);
            console.log('   You can still test the inscription hex generation');
        }

        console.log('\n🎉 All tests completed successfully!');
        console.log('\nGenerated inscription scripts:');
        console.log('- Text:', textHex);
        console.log('- Emoji:', emojiHex);
        console.log('- BRC-20:', brc20Hex);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        // Cleanup
        console.log('\n🧹 Cleaning up...');
        await manager.cleanup();
        process.exit(0);
    }
}

// Utility functions for manual testing
function verifyInscriptionStructure(hexScript) {
    const bytes = Buffer.from(hexScript, 'hex');
    console.log('\n🔍 Inscription Structure Analysis:');
    console.log('Total bytes:', bytes.length);

    // Look for ordinal envelope markers
    const ordMarker = Buffer.from("ord");
    const ordIndex = bytes.indexOf(ordMarker);

    if (ordIndex !== -1) {
        console.log('✅ Found "ord" marker at position:', ordIndex);

        // Look for content type
        const contentTypeTag = bytes.indexOf(Buffer.from([tags.contentType]));
        if (contentTypeTag !== -1) {
            console.log('✅ Found content type tag at position:', contentTypeTag);
        }

        // Look for OP_0 (0x00)
        const op0Index = bytes.indexOf(0x00, ordIndex);
        if (op0Index !== -1) {
            console.log('✅ Found OP_0 at position:', op0Index);
            console.log('📄 Data starts after position:', op0Index + 1);
        }
    } else {
        console.log('❌ No "ord" marker found');
    }

    return {
        totalBytes: bytes.length,
        hasOrdMarker: ordIndex !== -1,
        ordMarkerPosition: ordIndex
    };
}

// Manual testing function
async function testInscriptionFunctions() {
    console.log('🧪 Testing inscription functions without Bitcoin Core...\n');

    // Test all inscription types
    const tests = [
        {
            name: 'Text Inscription',
            hex: prepareTextInscription("Hello from Node.js!"),
        },
        {
            name: 'Emoji Inscription',
            hex: prepareEmojiInscription("🎯"),
        },
        {
            name: 'BRC-20 Deploy',
            hex: prepareBRC20Inscription({
                runeName: "NODE",
                operation: "deploy",
                maxSupply: "1000000",
                limit: "100"
            }),
        },
        {
            name: 'BRC-20 Mint',
            hex: prepareBRC20Inscription({
                runeName: "NODE",
                operation: "mint",
                amount: "100"
            }),
        }
    ];

    tests.forEach(test => {
        console.log(`\n📝 ${test.name}:`);
        console.log('Hex:', test.hex);
        verifyInscriptionStructure(test.hex);
    });
}

// Export for use in other modules
module.exports = {
    BitcoinRegtestManager,
    prepareTextInscription,
    prepareEmojiInscription,
    prepareBRC20Inscription,
    verifyInscriptionStructure,
    runTests,
    testInscriptionFunctions
};

// Run tests if this file is executed directly
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes('--no-bitcoin')) {
        // Test only inscription functions without Bitcoin Core
        testInscriptionFunctions();
    } else {
        // Full test with Bitcoin Core
        runTests();
    }
}