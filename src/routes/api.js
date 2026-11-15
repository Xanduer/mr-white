// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
const express = require('express');
const controller = require('../controllers/roomController');

const router = express.Router();
router.get('/health', controller.health);
router.get('/categories', controller.categories);
router.get('/rooms/:code', controller.roomInfo);

module.exports = router;
