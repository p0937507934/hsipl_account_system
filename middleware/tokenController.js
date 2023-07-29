const jwt = require("jsonwebtoken")
const errorHandler = require("./errorHandler")
const config = require('../config/auth.config')
const db = require('../models/index')

class TokenController {
  
  async signToken(payload) {
   
    const token = await jwt.sign(payload, config.secret, {
      expiresIn: "1d",
    })
    return token
  }

  async verifyToken(req, res, next) {
    try {
      const token = req.headers.authorization

      if(!token){
        return res.status('401').send(errorHandler.tokenError())
      }
      const rtoken = token.replace("Bearer ","")

      const result = await jwt.verify(rtoken, config.secret)
      req.user = result

    } 
    catch (error) {
      console.log(error)
      return res.status('401').send(errorHandler.tokenError())
    }
    
    return next()
  } 




}

module.exports = new TokenController()