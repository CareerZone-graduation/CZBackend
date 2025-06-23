// models/cvTemplate.js
import mongoose from "mongoose";

// style cho từng khối (section)
const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true }, // vd: 'skills'
    order: { type: Number, required: true }, // thứ tự hiển thị

    // tuỳ bạn cần toạ độ tuyệt đối hay chỉ order + flex / grid
    layout: {
      x: Number, // pixel hoặc %
      y: Number,
      width: Number,
      height: Number,
    },

    style: {
      fontFamily: String,
      fontSize: String,
      fontWeight: String,
      color: String,
      background: String,
      textAlign: { type: String, enum: ["left", "center", "right", "justify"] },
      padding: String,
      margin: String,
    },
  },
  { _id: false }
);

// theme chung cho template
const themeSchema = new mongoose.Schema(
  {
    primary: String, // #RRGGBB
    secondary: String,
    font: String,
  },
  { _id: false }
);

// schema template
const cvTemplateSchema = new mongoose.Schema(
  {
    _id: { type: String, trim: true }, // templateId (dễ nhớ, gọn)
    name: { type: String, required: true, trim: true },

    theme: themeSchema, // màu + font chung
    sections: [sectionSchema], // cấu hình vị trí/style khối

    previewUrl: { type: String, trim: true }, // ảnh preview
    isPublic: { type: Boolean, default: true }, // template công khai?
  },
  { timestamps: true }
);

// tìm theo tên
cvTemplateSchema.index({ name: "text" });

export default mongoose.model("CVTemplate", cvTemplateSchema);
