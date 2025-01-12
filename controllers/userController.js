/*
實驗室網站帳戶管理
 */
const db = require('../models')
const User = db.User
const Fund = db.Fund
const UserLog = db.UserLog
const { Op } = require('@sequelize/core')
const errorHandler = require('../middleware/errorHandler')
const {
    encrypt: encrypt,
    decrypt: decrypt,
} = require("../utils/encryptPassword")
const nodemailer = require('nodemailer')
const TokenController = require("../middleware/tokenController")
const SessionIdController = require('../middleware/sessionIdController')
const delFile = require('../middleware/deleteFile')
const mailConfig = require('../config/mail.config')
const jwt = require("jsonwebtoken")
const config = require('../config/auth.config')
const redis = require('redis')
const { generateSessionId } = require('../utils/sessionUtils');

class userController {
    protected = async (req, res) => {
        try {
            res.send('this is the protected page.')

        }
        catch (error) {
            return res.status(500).json({
                message: error
            })
        }

    }
    createUser = async (req, res) => {
        try {
            const { name, username, password, mail } = req.body
            //確認ip位址(白名單為實驗室ip)
            // const whitelist = ['140.125.45.160']
            // const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            // if (!whitelist.includes(ip)) {
            //     return res.status('400').json(errorHandler.ipError())
            // }

            if (!name || !username || !password || !mail) {
                return res.status(400).json(errorHandler.contentEmpty())
            }
            //確認user 資訊是否存在
            const checkUserExist = await User.findOne({
                where: {
                    [Op.or]: [
                        { name: name },
                        { username: username },
                        { mail: mail },
                    ]
                }
            })
            if (checkUserExist) {
                return res.status(409).json(errorHandler.userAlreadyExist())
            }

            //密碼加鹽
            const encryptPassword = await encrypt(password)
            //信箱認證
            // const transporter = nodemailer.createTransport(mailConfig)
            // let mailOption = {
            //     from: 'yuntechhsipl@gmail.com',
            //     subject: 'Email verify',
            //     to: `${mail}`,
            //     text: 'Your email has been verified.'
            // }

            // await transporter.sendMail(mailOption, (error, infor)=> {
            //     if (error){
            //         throw error
            //     }
            // })
            let infor = {
                name: name,
                username: username,
                password: encryptPassword,
                mail: mail,
            }
            //新增user
            await User.create(infor)
            return res.status(200).json({
                message: `Created ${req.body.name} sucessfully.`
            })
        }
        catch (error) {
            return res.status(500).json({
                message: error
            })
        }
    }
    login = async (req, res) => {
        /*登入邏輯
            建立redis連線 -> 確認帳號密碼 -> 根據使用者資訊生成jwt & sessionID return 給 client -> sessionData儲存用戶登入狀態並設定時效 -> 將sessionData 存至 redis    
         */
        try {
          const { username, password } = req.body
          const userExist = await User.findOne({
            where: {username: username}
          })
          if (!userExist) {
            return res.status(400).json(errorHandler.loginError())
            }
          const userId = userExist.id
          const payload = {
            name: userExist.name,
            mail: userExist.mail
          }
          if (!username || !password) {
            return res.status(400).json(errorHandler.contentEmpty());
          }
          const checkPassword = await decrypt(password, userExist.password);
          if (!checkPassword) {
            return res.status(400).json(errorHandler.loginError());
          }
            const jsonWebToken = await TokenController.signToken({payload})
            const sessionId = await SessionIdController.gernerateSessionId(userId)
            res.cookie('sessionId', sessionId)
            res.cookie('jsonWebToken', jsonWebToken)
            return res.status(200).json({
            message: `Login successfully! Welcome back ${userExist.name}.`,
            accessToken: jsonWebToken,
            sessionId: sessionId
          })
     
        } catch (error) {
          console.error(error);
          return res.status(500).json({
            message: error
          });
        }
      }
    //搜尋user名字的資訊
    findUser = async (req, res) => {
        const { name } = req.query
        try {
            const user = await User.findOne({
                include: [
                    { model: Fund }
                ],
                attributes: ['name', 'mail', 'studentID', 'phoneNum', 'birthday', 'lineID', 'balance'],
                where: {
                    name: name
                }
            })
            if (!user) {
                return res.status(404).json(errorHandler.dataNotFind())
            }
            return res.status(200).json(user)
        }
        catch (error) {
            return res.status(500).json({
                message: error
            })
        }
    }
    //刪除特定使用者
    deleteUser = async (req, res) => {
        try {
            const user = await User.findOne({
                where: { id: req.params.id }
            })
            //確認刪除該位user前餘額為0，以保證實驗室經費正確
            if (user.balance !== 0) {
                return res.status(409).send(errorHandler.balanceNotZero())
            }
            await User.destroy({ where: { id: user.id } })
            await UserLog.create({ message: `${user.name} was deleted.` })
            return res.status(200).json({
                message: `Deleted ${user.name} Sucessfully!`
            })
        }
        catch (error) {
            return res.status(500).json({
                message: error
            })
        }
    }
    userOptionSearch = async (req, res) => {
        try {
            //透過queryString篩選所有需求資料
            const attributes = req.query
            //若queryString為空，則回傳所有資料
            if (JSON.stringify(attributes) === '{}') {
                const user = await User.findAll({
                    raw: true
                })
                return res.status(200).json({ data: user })
            }
            const user = await User.findAll({
                attributes: Object.keys(attributes),
                raw: true
            })
            return res.status(200).json({
                data: user
            })
        }
        catch (error) {
            return res.status(500).json({
                message: error
            })
        }
    }
    forgetPassword = async (req, res) => {
        try {
            const { mail } = req.body
            //確認信箱有無正確
            const user = await User.findOne({ where: { mail: mail } })
            if (!user) {
                return res.status(404).json(errorHandler.dataNotFind())
            }
            //將使用者的id, username, mail 做成token
            const resetPasswordToken = await TokenController.signToken({ id: user.id, username: user.username, mail: user.mail })
            //解析回傳的 token
            const verifyToken = await jwt.verify(resetPasswordToken, config.secret)
            //更新user的 resetPasswordToken, resetPasswordExpires 欄位
            await User.update(
                { resetPasswordToken: resetPasswordToken, resetPasswordExpires: (verifyToken.exp) * 1000 },
                { where: { id: user.id } })
            //定義給使用者重設密碼的連結
            const resetPasswordLink = `Click this <a href="http://localhost:3000/api/user/resetPassword?token=${resetPasswordToken}">link</a> to reset password.`
            const transporter = nodemailer.createTransport(mailConfig)

            //信件設定
            let mailOption = {
                from: 'yuntechhsipl@gmail.com',
                subject: 'Reset password',
                to: `${mail}`,
                html: resetPasswordLink
            }

            await transporter.sendMail(mailOption)

            return res.status(200).json({
                message: 'Mail for reset password was sent to your mail, please check.',
                resetPasswordToken: resetPasswordToken
            })
        }

        catch (error) {
            return res.status(500).json({
                message: error
            })
        }
    }

    resetPassword = async (req, res) => {
        try {
            const resetPasswordToken = req.query.resetPasswordToken
            //檢查queryString中的token是否存在於資料庫
            const verifyUser = await User.findOne({ where: { resetPasswordToken: resetPasswordToken } })
            if (!verifyUser) {
                return res.status(401).json(errorHandler.loginError())
            }
            const verifyToken = await jwt.verify(resetPasswordToken, config.secret)
            const currentTime = Date.now() / 1000
            //檢查token是否過期
            if (verifyToken.exp < currentTime) {
                return res.status(401).json(errorHandler.loginError())
            }
            const { newPassword } = req.body
            const eNewPassword = await encrypt(newPassword)
            await User.update({ password: eNewPassword, resetPasswordToken: null, resetPasswordExpires: null }, { where: { id: verifyToken.id } })

            const transporter = nodemailer.createTransport(mailConfig)
            //密碼修改成功 寄通知信給user
            let mailOption = {
                from: 'yuntechhsipl@gmail.com',
                subject: 'Password was reseted.',
                to: `${verifyToken.mail}`,
                text: 'Your password has been successfully reset, please login again.'
            }
            await transporter.sendMail(mailOption)
            return res.status(200).json({
                message: 'Your password was updated sucessfully.'
            })
        } catch (error) {
            return res.status(500).json({
                message: error
            })
        }
    }


}
module.exports = new userController()
