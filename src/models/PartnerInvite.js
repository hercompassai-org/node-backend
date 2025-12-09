import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";


const PartnerInvite = sequelize.define("partner_invites", {
id: {
type: DataTypes.UUID,
defaultValue: DataTypes.UUIDV4,
primaryKey: true,
},
inviter_id: {
type: DataTypes.UUID,
allowNull: false,
},
partner_email: {
type: DataTypes.TEXT,
allowNull: false,
},
token: {
type: DataTypes.TEXT,
allowNull: false,
},
status: {
type: DataTypes.STRING,
defaultValue: 'pending'
},
expires_at: {
type: DataTypes.DATE,
allowNull: true
},
created_at: {
type: DataTypes.DATE,
defaultValue: DataTypes.NOW,
}
}, { timestamps: false });


export default PartnerInvite;