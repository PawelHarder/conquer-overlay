'use strict';

// Single entry point for Railway — starts both the poller and the read API
// in the same process so Railway only needs to run one dyno/worker.
require('./server');
require('./poller');
