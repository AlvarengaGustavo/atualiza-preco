import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config(
    {
        path: ".env"
    }
);

const sequelizeConnection = new Sequelize(
    process.env.DATABASE_SCHEMA,
    process.env.DATABASE_USERNAME,
    process.env.DATABASE_PASSWORD,
    {
        host: process.env.DATABASE_HOST,
        dialect: 'mysql',
        define: {
            timestamps: false
        }
    }
);

sequelizeConnection.authenticate().then(() => {
    console.log('Conexação efetuada com seucesso');
}).catch((error) => {
    console.error('Conexão não estabelecida: ', error);
});

export const Products = sequelizeConnection.define("products", {
    code: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    cost_price: {
        type: DataTypes.DECIMAL,
        allowNull: false
    },
    sales_price: {
        type: DataTypes.DECIMAL,
        allowNull: false
    },
},
    {
        freezeTableName: true
    }
);

export const Packs = sequelizeConnection.define("packs", {
    id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true
    },
    pack_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    qty: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
},
    {
        freezeTableName: true
    }
);

