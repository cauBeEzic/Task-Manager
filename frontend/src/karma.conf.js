// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
    config.set({
      basePath: '',
      frameworks: ['jasmine'],
      plugins: [
        require('karma-jasmine'),
        require('karma-chrome-launcher'),
        require('karma-jasmine-html-reporter'),
        require('karma-coverage')
      ],
      client: {
        clearContext: false // leave Jasmine Spec Runner output visible in browser
      },
      coverageReporter: {
        dir: require('path').join(__dirname, '../coverage'),
        reporters: [
          { type: 'html' },
          { type: 'lcovonly', subdir: '.', file: 'lcov.info' },
          { type: 'text-summary' }
        ],
        check: {
          emitWarning: false,
          each: {
            statements: 0,
            branches: 0,
            functions: 0,
            lines: 0,
            overrides: {
              '**/app/offline/sync.service.ts': {
                statements: 100,
                branches: 100,
                functions: 100,
                lines: 100
              },
              '**/app/offline/offline-db.service.ts': {
                statements: 100,
                branches: 100,
                functions: 100,
                lines: 100
              }
            }
          }
        }
      },
      reporters: ['progress', 'kjhtml', 'coverage'],
      port: 9876,
      colors: true,
      logLevel: config.LOG_INFO,
      autoWatch: true,
      browsers: ['Chrome'],
      singleRun: false
    });
  };
