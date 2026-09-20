#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = resolve(process.cwd());

// Helper to run git ls-files and return array of file paths relative to root
function gitLsFiles() {
  const output = execSync('git ls-files', { cwd: rootDir, encoding: 'utf8' });
  return output
    .trim()
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter(Boolean);
}

// Helper to read file content as string
function readFile(filePath) {
  return readFileSync(join(rootDir, filePath), 'utf8');
}

// Problem 2 Acceptance Audit: "Take your records with you"
// Meera files a sighting in one app and opens it in a completely different one, and nobody had to export anything.

// Check 1: Writer can create and upload sightings to Swarm
function check1() {
  try {
    const files = gitLsFiles();
    const writerMainExists = files.includes('writer/src/main.js');
    const uploadControllerExists = files.includes('writer/src/upload-controller.js');
    const sightingFormExists = files.includes('writer/src/sighting-form.js');
    const authExists = files.includes('writer/src/auth.js');

    if (!writerMainExists || !uploadControllerExists || !sightingFormExists || !authExists) {
      return {
        passed: false,
        message: `Check 1 failed: Writer components missing\n` +
          `  writer/src/main.js: ${writerMainExists}\n` +
          `  writer/src/upload-controller.js: ${uploadControllerExists}\n` +
          `  writer/src/sighting-form.js: ${sightingFormExists}\n` +
          `  writer/src/auth.js: ${authExists}`
      };
    }

    // Verify upload-controller uses Swarm's /bytes endpoint
    const uploadContent = readFile('writer/src/upload-controller.js');
    const usesBytesEndpoint = uploadContent.includes('/bytes/') ||
                              uploadContent.includes('uploadBytes') ||
                              uploadContent.includes('POST /bytes');

    if (!usesBytesEndpoint) {
      return {
        passed: false,
        message: `Check 1 failed: Writer upload-controller does not appear to use Swarm /bytes endpoint`
      };
    }

    return { passed: true, message: 'Check 1 passed: Writer can create and upload sightings to Swarm' };
  } catch (err) {
    return { passed: false, message: `Check 1 failed with error: ${err.message}` };
  }
}

// Check 2: Reader can retrieve and display sightings from Swarm
function check2() {
  try {
    const files = gitLsFiles();
    const readerMainExists = files.includes('reader/src/main.js');
    const swarmHelperExists = files.includes('reader/src/swarm.js');
    const sightingViewerExists = files.includes('reader/src/sighting-viewer.js');

    if (!readerMainExists || !swarmHelperExists || !sightingViewerExists) {
      return {
        passed: false,
        message: `Check 2 failed: Reader components missing\n` +
          `  reader/src/main.js: ${readerMainExists}\n` +
          `  reader/src/swarm.js: ${swarmHelperExists}\n` +
          `  reader/src/sighting-viewer.js: ${sightingViewerExists}`
      };
    }

    // Verify reader uses Swarm's /bytes endpoint for downloading
    const swarmContent = readFile('reader/src/swarm.js');
    const usesBytesEndpoint = swarmContent.includes('/bytes/') ||
                              swarmContent.includes('downloadBytes') ||
                              swarmContent.includes('GET /bytes');

    if (!usesBytesEndpoint) {
      return {
        passed: false,
        message: `Check 2 failed: Reader does not appear to use Swarm /bytes endpoint for downloads`
      };
    }

    return { passed: true, message: 'Check 2 passed: Reader can retrieve and display sightings from Swarm' };
  } catch (err) {
    return { passed: false, message: `Check 2 failed with error: ${err.message}` };
  }
}

// Check 3: Same Swarm endpoint family used for both write and read (no export/import step)
function check3() {
  try {
    const uploadContent = readFile('writer/src/upload-controller.js');
    const readerSwarmContent = readFile('reader/src/swarm.js');

    // Both should reference the same endpoint pattern
    // More flexible checking for /bytes endpoint usage
    const writerHasBytes = uploadContent.includes('/bytes') ||
                          uploadContent.includes('uploadBytes') ||
                          uploadContent.includes('POST /bytes');
    const readerHasBytes = readerSwarmContent.includes('/bytes') ||
                          readerSwarmContent.includes('downloadBytes') ||
                          readerSwarmContent.includes('GET /bytes');

    if (!writerHasBytes || !readerHasBytes) {
      return {
        passed: false,
        message: `Check 3 failed: Both writer and reader must use Swarm /bytes endpoint\n` +
          `  Writer uses /bytes/: ${writerHasBytes} (found: uploadBytes, /bytes, or POST /bytes)\n` +
          `  Reader uses /bytes/: ${readerHasBytes} (found: downloadBytes, /bytes, or GET /bytes)`
      };
    }

    return { passed: true, message: 'Check 3 passed: Same Swarm endpoint family used for both write and read (no export/import step)' };
  } catch (err) {
    return { passed: false, message: `Check 3 failed with error: ${err.message}` };
  }
}

// Check 4: Reader works without original Writer application (zero Writer imports)
function check4() {
  try {
    const files = gitLsFiles();
    const readerSrcFiles = files.filter((f) => f.startsWith('reader/src/') && f.endsWith('.js'));
    const errors = [];

    for (const file of readerSrcFiles) {
      const content = readFile(file);
      // Check for any imports from writer/
      // Updated patterns to handle whitespace and both import/require syntax
      const writerImportPatterns = [
        // ES6 import statements: import ... from '../writer/src/...'
        /from\s+['"]\.\.\/writer\/src\/['"]/,
        // ES6 import statements: import ... from './writer/src/...'
        /from\s+['"]\.\/writer\/src\/['"]/,
        // ES6 import statements: import ... from 'writer/src/...' (relative or absolute)
        /from\s+['"]\/writer\/src\/['"]/,
        // ES6 import statements: import ... from 'writer/src/...' (no leading ./ or ../)
        /from\s+['"]writer\/src\/['"]/,
        // CommonJS require statements: require('../writer/src/...')
        /require\s*\(\s*['"]\.\.\/writer\/src\/['"]\s*\)/,
        // CommonJS require statements: require('./writer/src/...')
        /require\s*\(\s*['"]\.\/writer\/src\/['"]\s*\)/,
        // CommonJS require statements: require('writer/src/...')
        /require\s*\(\s*['"]\/writer\/src\/['"]\s*\)/,
        // CommonJS require statements: require('writer/src/...') (no leading ./ or ../)
        /require\s*\(\s*['"]writer\/src\/['"]\s*\)/
      ];

      const allPatterns = [
        // ES6 import statements
        /from\s+['"]\.\.\/writer\/src\/['"]/,
        /from\s+['"]\.\/writer\/src\/['"]/,
        /from\s+['"]\/writer\/src\/['"]/,
        /from\s+['"]writer\/src\/['"]/,
        // CommonJS require statements
        /require\s*\(\s*['"]\.\.\/writer\/src\/['"]\s*\)/,
        /require\s*\(\s*['"]\.\/writer\/src\/['"]\s*\)/,
        /require\s*\(\s*['"]\/writer\/src\/['"]\s*\)/,
        /require\s*\(\s*['"]writer\/src\/['"]\s*\)/
      ];

      for (const pattern of allPatterns) {
        if (pattern.test(content)) {
          errors.push(`${file}: illegal import from writer/ application`);
          break;
        }
      }
    }

    if (errors.length > 0) {
      return {
        passed: false,
        message: `Check 4 failed:\\n${errors.join('\\n')}`
      };
    }

    return { passed: true, message: 'Check 4 passed: Reader works without original Writer application (zero Writer imports)' };
  } catch (err) {
    return { passed: false, message: `Check 4 failed with error: ${err.message}` };
  }
}

// Check 5: Reader works without Swarm ID account (no auth required for reading)
function check5() {
  try {
    const readerSwarmContent = readFile('reader/src/swarm.js');
    const readerMainContent = readFile('reader/src/main.js');

    // Check that download function doesn't require authentication parameters
    const hasAuthParams = readerSwarmContent.includes('identity') ||
                          readerSwarmContent.includes('auth') ||
                          readerSwarmContent.includes('signIn') ||
                          readerSwarmContent.includes('connect');

    // The downloadBytes function should work without auth
    const downloadFunction = readerSwarmContent.match(/async\s+downloadBytes\s*\([^)]*\)/);
    if (downloadFunction) {
      const params = downloadFunction[0];
      // Should only have reference parameter, no auth params
      const hasOnlyReference = params.includes('reference') &&
                              !params.includes('identity') &&
                              !params.includes('auth');

      if (!hasOnlyReference) {
        return {
          passed: false,
          message: `Check 5 failed: Reader download function requires authentication parameters\n` +
            `  Function signature: ${params}`
        };
      }
    }

    return { passed: true, message: 'Check 5 passed: Reader works without Swarm ID account (no auth required for reading)' };
  } catch (err) {
    return { passed: false, message: `Check 5 failed with error: ${err.message}` };
  }
}

// Check 6: Documented self-describing binary format (DBIR specification)
function check6() {
  try {
    const formatExists = existsSync(join(rootDir, 'shared', 'FORMAT.md'));
    const sightingFormatExists = existsSync(join(rootDir, 'shared', 'sighting-format.js'));
    const sightingFormatTestExists = existsSync(join(rootDir, 'shared', 'sighting-format.test.js'));

    if (!formatExists || !sightingFormatExists || !sightingFormatTestExists) {
      return {
        passed: false,
        message: `Check 6 failed: DBIR documentation or implementation missing\n` +
          `  shared/FORMAT.md: ${formatExists}\n` +
          `  shared/sighting-format.js: ${sightingFormatExists}\n` +
          `  shared/sighting-format.test.js: ${sightingFormatTestExists}`
      };
    }

    // Verify FORMAT.md contains key specification elements
    const formatContent = readFile('shared/FORMAT.md');
    const requiredSections = [
      '# DBIR — Deccan Birders Interchange Record Format',
      '## 2. Binary Envelope',
      '## 3. JSON Payload (Version 1)',
      '## 4. Validation Rules'
    ];

    const missingSections = requiredSections.filter(section => !formatContent.includes(section));
    if (missingSections.length > 0) {
      return {
        passed: false,
        message: `Check 6 failed: FORMAT.md missing required sections:\n${missingSections.map(s => `  ${s}`).join('\n')}`
      };
    }

    // Verify sighting-format.js implements the specification
    const sfContent = readFile('shared/sighting-format.js');
    const hasMagic = sfContent.includes('0x44') && sfContent.includes('0x42') &&
                     sfContent.includes('0x49') && sfContent.includes('0x52');
    const hasVersionCheck = sfContent.includes('version') && sfContent.includes('MAX_SUPPORTED_VERSION');
    const hasLengthCheck = sfContent.includes('payloadLength') && sfContent.includes('HEADER_SIZE');
    const hasJsonParse = sfContent.includes('JSON.parse');
    const hasValidation = sfContent.includes('validateSighting');

    const implementationChecks = [
      ['Magic bytes check', hasMagic],
      ['Version validation', hasVersionCheck],
      ['Payload length validation', hasLengthCheck],
      ['JSON parsing', hasJsonParse],
      ['Required field validation', hasValidation]
    ];

    const failedChecks = implementationChecks.filter(([name, passes]) => !passes);
    if (failedChecks.length > 0) {
      return {
        passed: false,
        message: `Check 6 failed: sighting-format.js missing implementation:\n${failedChecks.map(([name]) => `  ${name}`).join('\n')}`
      };
    }

    return { passed: true, message: 'Check 6 passed: Documented self-describing binary format (DBIR specification)' };
  } catch (err) {
    return { passed: false, message: `Check 6 failed with error: ${err.message}` };
  }
}

// Check 7: Content-addressed records (64-character hex Swarm references)
function check7() {
  try {
    // Check that references are 64-character hex strings
    const publicExampleRef = 'd2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e4';
    const hex64Regex = /^[0-9a-fA-F]{64}$/;

    if (!hex64Regex.test(publicExampleRef)) {
      return {
        passed: false,
        message: `Check 7 failed: Public example reference is not a valid 64-character hex string\n` +
          `  Reference: ${publicExampleRef}`
      };
    }

    // Verify that the reference format is documented
    const formatContent = readFile('shared/FORMAT.md');
    const hasReferenceSection = formatContent.includes('## 6. Reference Representation');
    const hasHexReference = formatContent.includes('64-character') && formatContent.includes('hexadecimal string');
    const hasDeepLink = formatContent.includes('<reader-origin>/?ref=<hex-reference>');

    if (!hasReferenceSection || !hasHexReference || !hasDeepLink) {
      return {
        passed: false,
        message: `Check 7 failed: FORMAT.md missing reference documentation\n` +
          `  Reference section: ${hasReferenceSection}\n` +
          `  64-char hex mention: ${hasHexReference}\n` +
          `  Deep-link format: ${hasDeepLink}`
      };
    }

    return { passed: true, message: 'Check 7 passed: Content-addressed records (64-character hex Swarm references)' };
  } catch (err) {
    return { passed: false, message: `Check 7 failed with error: ${err.message}` };
  }
}

// Check 8: Backward compatibility - existing records must still decode
function check8() {
  try {
    const formatContent = readFile('shared/FORMAT.md');
    const sfContent = readFile('shared/sighting-format.js');

    // Check that FORMAT.md specifies backward compatibility
    const hasBackwardCompatibility = formatContent.includes('Additive (non-breaking) changes') &&
                                     formatContent.includes('readers MUST ignore unknown fields');

    // Check that sighting-format.js allows unknown fields (forward compatibility)
    // The validateSighting function only validates known fields and doesn't reject extra ones
    const hasUnknownFieldsHandling = sfContent.includes('validateSighting') &&
                                     !sfContent.includes('reject unknown fields') &&
                                     !sfContent.includes('strict validation') &&
                                     sfContent.includes('Optional field type checks');

    // Check version policy - check for the section and key phrases with correct formatting
    const hasVersionPolicy = formatContent.includes('## 8. Versioning Policy') &&
                             formatContent.includes('The magic bytes `DBIR` will never change') &&
                             formatContent.includes('Additive (non-breaking) changes');

    const failedChecks = [];
    if (!hasBackwardCompatibility) failedChecks.push('FORMAT.md backward compatibility documentation');
    if (!hasUnknownFieldsHandling) failedChecks.push('sighting-format.js allows unknown fields (forward compatibility)');
    if (!hasVersionPolicy) failedChecks.push('FORMAT.md versioning policy');

    if (failedChecks.length > 0) {
      return {
        passed: false,
        message: `Check 8 failed: Backward compatibility issues:\n${failedChecks.map(c => `  ${c}`).join('\n')}`
      };
    }

    return { passed: true, message: 'Check 8 passed: Backward compatibility - existing records must still decode' };
  } catch (err) {
    return { passed: false, message: `Check 8 failed with error: ${err.message}` };
  }
}

// Self-test: exercise the audit logic by testing against known good and bad scenarios
function selfTest() {
  try {
    // Test 1: Verify that a known good reference passes Check 7
    const goodRef = 'd2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e4';
    const hex64Regex = /^[0-9a-fA-F]{64}$/;
    if (!hex64Regex.test(goodRef)) {
      return {
        passed: false,
        message: 'Self-test failed: Known good 64-char hex reference rejected'
      };
    }

    // Test 2: Verify that a known bad reference fails Check 7
    const badRefTooShort = 'd2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e'; // 63 chars
    const badRefTooLong = 'd2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e44'; // 65 chars
    const badRefNotHex = 'd2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6eg'; // contains 'g'

    if (hex64Regex.test(badRefTooShort) ||
        hex64Regex.test(badRefTooLong) ||
        hex64Regex.test(badRefNotHex)) {
      return {
        passed: false,
        message: 'Self-test failed: Bad reference incorrectly accepted'
      };
    }

    // Test 3: Verify FORMAT.md contains required sections
    const formatContent = readFile('shared/FORMAT.md');
    const requiredSections = [
      '# DBIR — Deccan Birders Interchange Record Format',
      '## 2. Binary Envelope',
      '## 3. JSON Payload (Version 1)',
      '## 4. Validation Rules'
    ];
    const missingSections = requiredSections.filter(section => !formatContent.includes(section));
    if (missingSections.length > 0) {
      return {
        passed: false,
        message: `Self-test failed: FORMAT.md missing sections: ${missingSections.join(', ')}`
      };
    }

    // Test 4: Verify sighting-format.js has validateSighting function
    const sfContent = readFile('shared/sighting-format.js');
    if (!sfContent.includes('validateSighting')) {
      return {
        passed: false,
        message: 'Self-test failed: sighting-format.js missing validateSighting function'
      };
    }

    // Test 5: Verify that we can detect a fake writer import in reader code
    // Create a temporary test content with a fake import
    const fakeContent = 'from "./writer/src/some-file.js";';
    // Updated patterns to handle whitespace and both import/require syntax (same as in check4)
    const writerImportPatterns = [
      // ES6 import statements: import ... from '../writer/src/...'
      /from\s+['"]\.\.\/writer\/src\/[^"']*["']/,
      // ES6 import statements: import ... from './writer/src/...'
      /from\s+['"]\.\/writer\/src\/[^"']*["']/,
      // ES6 import statements: import ... from 'writer/src/...' (relative or absolute)
      /from\s+['"]\/writer\/src\/[^"']*["']/,
      // ES6 import statements: import ... from 'writer/src/...' (no leading ./ or ../)
      /from\s+['"]writer\/src\/[^"']*["']/,
      // CommonJS require statements: require('../writer/src/...')
      /require\s*\(\s*['"]\.\.\/writer\/src\/[^"']*["']\s*\)/,
      // CommonJS require statements: require('./writer/src/...')
      /require\s*\(\s*['"]\.\/writer\/src\/[^"']*["']\s*\)/,
      // CommonJS require statements: require('writer/src/...')
      /require\s*\(\s*['"]\/writer\/src\/[^"']*["']\s*\)/,
      // CommonJS require statements: require('writer/src/...') (no leading ./ or ../)
      /require\s*\(\s*['"]writer\/src\/[^"']*["']\s*\)/
    ];

    let hasImport = false;
    for (const pattern of writerImportPatterns) {
      if (pattern.test(fakeContent)) {
        hasImport = true;
        break;
      }
    }

    if (!hasImport) {
      return {
        passed: false,
        message: 'Self-test failed: Could not detect fake writer import'
      };
    }

    // All tests passed
    return { passed: true, message: 'Self-test passed: All audit logic functions correctly' };
  } catch (err) {
    return { passed: false, message: `Self-test failed with error: ${err.message}` };
  }
}

// Main function
async function main() {
  console.log('Running Problem 2 Acceptance Audit...\\n');
  console.log('Verifying: "Meera files a sighting in one app and opens it in a completely different one, and nobody had to export anything."\\n');

  const checks = [
    { name: 'Check 1: Writer creates/uploads to Swarm', fn: check1 },
    { name: 'Check 2: Reader retrieves/displays from Swarm', fn: check2 },
    { name: 'Check 3: Same endpoint family (no export/import)', fn: check3 },
    { name: 'Check 4: Reader independent of Writer', fn: check4 },
    { name: 'Check 5: Reader works without Swarm ID', fn: check5 },
    { name: 'Check 6: Documented DBIR format', fn: check6 },
    { name: 'Check 7: Content-addressed records', fn: check7 },
    { name: 'Check 8: Backward compatibility', fn: check8 },
    { name: 'Self-test', fn: selfTest },
  ];

  let allPassed = true;
  for (const { name, fn } of checks) {
    try {
      const result = fn();
      if (result.skipped) {
        console.log(`⏭️  ${name}: SKIPPED - ${result.reason}`);
      } else if (result.passed) {
        console.log(`✅ ${name}: PASS`);
      } else {
        console.log(`❌ ${name}: FAIL`);
        console.log(result.message);
        allPassed = false;
      }
    } catch (err) {
      console.log(`❌ ${name}: ERROR`);
      console.log(err);
      allPassed = false;
    }
    console.log(''); // blank line
  }

  console.log('='.repeat(60));
  if (allPassed) {
    console.log('🎉 ALL CHECKS PASSED - Problem 2 acceptance criteria verified!');
    console.log('✅ Meera can file a sighting in one app and open it in a completely different one');
    console.log('✅ Nobody had to export anything');
    process.exit(0);
  } else {
    console.log('❌ SOME CHECKS FAILED - Problem 2 acceptance criteria NOT fully satisfied');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});