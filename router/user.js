const express = require("express");
const router = express.Router();
const UserController = require("../controller/user");
const TokenController = require("../utils/tokenController");

router.post("/", UserController.register);
router.post("/login", UserController.login);
module.exports = router;
