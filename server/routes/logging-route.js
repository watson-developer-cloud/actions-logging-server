// import dependencies and initialize the express router
const express = require('express');
const LoggingController = require('../controllers/logging-controller');

const router = express.Router();

// define routes
router.post('/logs_webhook', LoggingController.logs_webhook);
router.get('/stats', LoggingController.getAssistantStats);
router.get('/assistants', LoggingController.listAssistants)

module.exports = router;
