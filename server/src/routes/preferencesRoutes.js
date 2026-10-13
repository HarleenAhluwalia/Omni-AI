
const router = require("express").Router();

const { requireAuth } = require("../middleware/auth");

const {
  getPreferences,
  savePreferences,
} = require("../controllers/preferencesController");

router.use(requireAuth);

router.get("/", getPreferences);
router.put("/", savePreferences);

module.exports = router;
