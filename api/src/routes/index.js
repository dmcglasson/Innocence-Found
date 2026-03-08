const chapters = require('./chapters');
const documents = require('./documents');

const router = require('express').Router();

router.use('/chapters', chapters);
router.use('/documents', documents);

module.exports = router;
