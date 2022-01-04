const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const connectDb = async () => {
  try {
    mongoose.connect('mongodb://localhost/mydb',{
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false,
    }).then(() =>console.log('mongodb connect local sucess!'))
    
    /*const mongodb_url =
      process.env.NODE_ENV === "development"
        ? process.env.MONGODB_URL
        : process.env.MONGODB_PROD;
    const conn = await mongoose.connect(mongodb_url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
    });
    console.log(`mongodb connected remote sucess!: ${conn.connection.host}`);*/
    
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

module.exports = connectDb;
