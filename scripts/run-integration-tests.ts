import { spawn } from 'child_process';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import path from 'path';

let rabbitMQContainer: StartedTestContainer;
let connectionUrl: string;

async function setupRabbitMQ(): Promise<string> {
  console.log('🚀 Starting RabbitMQ container for integration tests...');
  
  rabbitMQContainer = await new GenericContainer('rabbitmq:3.12-management')
    .withExposedPorts(5672, 15672)
    .withEnvironment({
      RABBITMQ_DEFAULT_USER: 'test',
      RABBITMQ_DEFAULT_PASS: 'test',
      RABBITMQ_DEFAULT_VHOST: '/'
    })
    .withWaitStrategy(Wait.forLogMessage('Server startup complete'))
    .start();

  connectionUrl = `amqp://test:test@localhost:${rabbitMQContainer.getMappedPort(5672)}`;
  
  console.log(`✅ RabbitMQ container started on port ${rabbitMQContainer.getMappedPort(5672)}`);
  console.log(`🌐 Management UI available on port ${rabbitMQContainer.getMappedPort(15672)}`);
  console.log(`🔗 Connection URL: ${connectionUrl}`);
  
  return connectionUrl;
}

async function teardownRabbitMQ(): Promise<void> {
  if (rabbitMQContainer) {
    console.log('🛑 Stopping RabbitMQ container...');
    await rabbitMQContainer.stop();
    console.log('✅ RabbitMQ container stopped');
  }
}

async function runTestFile(testFile: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n🧪 Running test: ${testFile}`);
    
    const testProcess = spawn('npx', [
      'jest',
      '--config=jest.config.integration.json',
      '--testPathPattern=' + testFile,
      '--verbose',
      '--forceExit'
    ], {
      stdio: 'inherit',
      env: {
        ...process.env,
        RABBITMQ_CONNECTION_URL: connectionUrl
      }
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Test passed: ${testFile}`);
        resolve(true);
      } else {
        console.log(`❌ Test failed: ${testFile} (exit code: ${code})`);
        resolve(false);
      }
    });

    testProcess.on('error', (error) => {
      console.error(`❌ Error running test ${testFile}:`, error);
      resolve(false);
    });
  });
}

async function runAllIntegrationTests(): Promise<void> {
  const testFiles = [
    'simple.integration.test.ts',
    'rabbitmq-event-bus.integration.test.ts',
    'event-processor.integration.test.ts',
    'event-dispatcher.integration.test.ts',
    'event-system.integration.test.ts'
  ];

  try {
    // Setup RabbitMQ container
    await setupRabbitMQ();
    
    // Wait a bit for container to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n📋 Running integration tests...');
    
    const results: { file: string; passed: boolean }[] = [];
    
    for (const testFile of testFiles) {
      const passed = await runTestFile(testFile);
      results.push({ file: testFile, passed });
    }
    
    // Summary
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${result.file}`);
    });
    
    console.log(`\n📈 Total: ${results.length} tests`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\n❌ Some tests failed!');
      process.exit(1);
    } else {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Error during test execution:', error);
    process.exit(1);
  } finally {
    await teardownRabbitMQ();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, cleaning up...');
  await teardownRabbitMQ();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, cleaning up...');
  await teardownRabbitMQ();
  process.exit(0);
});

// Run the tests
runAllIntegrationTests();
