const express = require('express');
const router = express.Router();
const passport = require('passport');
const { createCv, getCvById, updateCv, exportPdf, getAllCVs ,deleteCv} = require('../controllers/cvController');
const { candidateOnly } = require('../middleware/auth.middleware');

router.route('/').post(passport.authenticate('jwt', { session: false }), candidateOnly, createCv).get(passport.authenticate('jwt', { session: false }), candidateOnly, getAllCVs);

router.route('/:id').get(passport.authenticate('jwt', { session: false }), candidateOnly, getCvById).put(passport.authenticate('jwt', { session: false }), candidateOnly, updateCv).delete(passport.authenticate('jwt', { session: false }), candidateOnly, deleteCv);

router.route('/:id/export-pdf').post(passport.authenticate('jwt', { session: false }), candidateOnly, exportPdf);

module.exports = router;
