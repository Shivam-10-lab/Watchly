import mongoose from 'mongoose';
import bcrypt   from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Name is required'],
      trim:      true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },

    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email',
      ],
    },

    password: {
      type:      String,
      required:  [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select:    false,
    },

    refreshTokens: [
      {
        token:     { type: String, required: true },
        createdAt: { type: Date,   default: Date.now },
      },
    ],

    isActive: {
      type:    Boolean,
      default: true,
    },

    alertPreferences: {
      emailAlerts:    { type: Boolean, default: true },
      recoveryAlerts: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 });    
userSchema.index({ createdAt: -1 }); 

// ── Pre-save hook: hash password ──────────────────────────────────────────────

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt   = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// ── Instance methods ──────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toPublicJSON = function () {
  return {
    _id:              this._id,
    name:             this.name,
    email:            this.email,
    alertPreferences: this.alertPreferences,
    createdAt:        this.createdAt,
  };
};

const User = mongoose.model('User', userSchema);
export default User;