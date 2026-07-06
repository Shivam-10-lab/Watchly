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
      // select: false — never returned in queries by default
      // Must explicitly do .select('+password') to get it
    },

    // One user can be logged in on multiple devices simultaneously.
    // Each device gets its own refresh token stored here.
    // On logout, only that device's token is removed.
    // On "logout all devices", the entire array is cleared.
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

    // Email preferences for alert notifications
    alertPreferences: {
      emailAlerts:    { type: Boolean, default: true },
      recoveryAlerts: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    // timestamps: true adds createdAt + updatedAt automatically
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 });      // already unique, this makes lookups fast
userSchema.index({ createdAt: -1 }); // for sorting users newest first

// ── Pre-save hook: hash password ──────────────────────────────────────────────
// Using async function without next parameter — correct for modern Mongoose
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