const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🚀 Bitcoin Inscription Testing Setup\n');

// Check if Bitcoin Core is installed
function checkBitcoinCore() {
    return new Promise((resolve) => {
        exec('bitcoind --version', (error, stdout) => {
            if (error) {
                console.log('❌ Bitcoin Core not found');
                console.log('📥 Please install Bitcoin Core from: https://bitcoincore.org/en/download/');
                resolve(false);
            } else {
                console.log('✅ Bitcoin Core found:', stdout.split('\n')[0]);
                resolve(true);
            }
        });
    });
}

// Check if ord is installed
function checkOrd() {
    return new Promise((resolve) => {
        exec('ord --version', (error, stdout) => {
            if (error) {
                console.log('❌ Ord not found');
                console.log('📥 Install ord with: npm run install-ord');
                console.log('   Or manually: curl --proto "=https" --tlsv1.2 -fsLS https://ordinals.com/install.sh | bash');
                resolve(false);
            } else {
                console.log('✅ Ord found:', stdout.trim());
                resolve(true);
            }
        });
    });
}

// Create necessary directories
function createDirectories() {
    const homeDir = os.homedir();
    const bitcoinDir = path.join(homeDir, '.bitcoin');
    const ordDir = path.join(homeDir, '.local', 'share', 'ord');

    [bitcoinDir, ordDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created directory: ${dir}`);
        }
    });
}

// Main setup function
async function setup() {
    console.log('🔍 Checking dependencies...\n');

    const hasBitcoin = await checkBitcoinCore();
    const hasOrd = await checkOrd();

    console.log('\n📁 Creating directories...');
    createDirectories();

    console.log('\n📋 Setup Summary:');
    console.log('- Bitcoin Core:', hasBitcoin ? '✅ Ready' : '❌ Install required');
    console.log('- Ord:', hasOrd ? '✅ Ready' : '❌ Install required');

    if (hasBitcoin) {
        console.log('\n🚀 You can now run:');
        console.log('  npm test              # Full test with Bitcoin regtest');
        console.log('  npm run test-functions-only  # Test inscription functions only');
    } else {
        console.log('\n⚠️  Install Bitcoin Core first, then run setup again');
    }

    if (!hasOrd) {
        console.log('\n💡 To install ord:');
        console.log('  npm run install-ord   # Auto install');
        console.log('  # OR manually download from https://github.com/ordinals/ord/releases');
    }

    console.log('\n✨ Setup complete!');
}

setup().catch(console.error);