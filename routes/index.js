const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const User = require('../models/user');
const Task = require('../models/task');

// ---------- helpers ----------
function parseJSONParam(param) {
  if (!param) return undefined;
  try { return JSON.parse(param); } catch { return undefined; }
}
function ok(res, data) { return res.status(200).json({ message: 'OK', data }); }
function created(res, data) { return res.status(201).json({ message: 'Created', data }); }
function bad(res, msg) { return res.status(400).json({ message: msg, data: {} }); }
function notFound(res, msg) { return res.status(404).json({ message: msg, data: {} }); }
function err(res, msg) { return res.status(500).json({ message: msg, data: {} }); }

// ---------- sanity ----------
router.get('/', (_req, res) => ok(res, { api: 'todo', version: 1 }));


// USERS

// GET /api/users (supports where, sort, select, skip, limit, count)
router.get('/users', async (req, res) => {
  try {
    const where = parseJSONParam(req.query.where) || {};
    const sort = parseJSONParam(req.query.sort);
    const select = parseJSONParam(req.query.select);
    const skip = parseInt(req.query.skip) || 0;
    const limit = parseInt(req.query.limit) || 0; 
    const count = req.query.count === 'true';

    if (count) {
      const n = await User.countDocuments(where);
      return ok(res, n);
    }

    let q = User.find(where);
    if (sort) q = q.sort(sort);
    if (select) q = q.select(select);
    if (skip) q = q.skip(skip);
    if (limit) q = q.limit(limit);

    const users = await q.exec();
    return ok(res, users);
  } catch (e) {
    console.error('Error fetching users:', e);
    return err(res, 'Error fetching users');
  }
});

// POST /api/users
router.post('/users', async (req, res) => {
  try {
    const { name, email, pendingTasks } = req.body || {};
    if (!name || !email) return bad(res, 'Name and email are required');

    const user = new User({ name, email, pendingTasks: Array.isArray(pendingTasks) ? pendingTasks : [] });
    const saved = await user.save();
    return res.status(201).json({
    message: 'Created',
    data: { _id: saved._id, ...saved.toObject() }
});
  } catch (e) {
    if (e.code === 11000) return bad(res, 'Email already exists');
    console.error('Error creating user:', e);
    return err(res, 'Error creating user');
  }
});

// GET /api/users/:id (supports ?select=)
router.get('/users/:id', async (req, res) => {
  try {
    const select = parseJSONParam(req.query.select);
    let q = User.findById(req.params.id);
    if (select) q = q.select(select);
    const user = await q.exec();
    if (!user) return notFound(res, 'User not found');
    return ok(res, user);
  } catch (e) {
    return err(res, 'Error fetching user');
  }
});

// PUT /api/users/:id (replace)
router.put('/users/:id', async (req, res) => {
  try {
    const { name, email, pendingTasks } = req.body || {};
    if (!name || !email) return bad(res, 'Name and email are required');

    // Update user first
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, pendingTasks: Array.isArray(pendingTasks) ? pendingTasks : [] },
      { new: true, runValidators: true }
    );
    if (!updated) return notFound(res, 'User not found');

    // Two-way ref: ensure tasks in pendingTasks are assigned to this user (if not completed)
    if (Array.isArray(pendingTasks)) {
      // Unassign tasks not in pendingTasks
      await Task.updateMany(
        { assignedUser: req.params.id, _id: { $nin: pendingTasks } },
        { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
      );
      // Assign listed pending tasks to this user (only those not completed)
      await Task.updateMany(
        { _id: { $in: pendingTasks }, completed: false },
        { $set: { assignedUser: updated._id.toString(), assignedUserName: updated.name } }
      );
    }

    return ok(res, updated);
  } catch (e) {
    console.error('Error updating user:', e);
    return err(res, 'Error updating user');
  }
});

// DELETE /api/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return notFound(res, 'User not found');

    // Two-way ref: unassign the user's pending tasks
    await Task.updateMany(
      { assignedUser: req.params.id, completed: false },
      { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
    );

    return ok(res, user);
  } catch (e) {
    console.error('Error deleting user:', e);
    return err(res, 'Error deleting user');
  }
});


// TASKS

// GET /api/tasks (supports where, sort, select, skip, limit, count)
router.get('/tasks', async (req, res) => {
  try {
    const where = parseJSONParam(req.query.where) || {};
    const sort = parseJSONParam(req.query.sort);
    const select = parseJSONParam(req.query.select);
    const skip = parseInt(req.query.skip) || 0;
    const limit = parseInt(req.query.limit) || 100; // default 100 for tasks
    const count = req.query.count === 'true';

    if (count) {
      const n = await Task.countDocuments(where);
      return ok(res, n);
    }

    let q = Task.find(where);
    if (sort) q = q.sort(sort);
    if (select) q = q.select(select);
    if (skip) q = q.skip(skip);
    if (limit) q = q.limit(limit);

    const tasks = await q.exec();
    return ok(res, tasks);
  } catch (e) {
    console.error('Error fetching tasks:', e);
    return err(res, 'Error fetching tasks');
  }
});

// POST /api/tasks
router.post('/tasks', async (req, res) => {
  try {
    const { name, description, deadline, completed, assignedUser, assignedUserName } = req.body || {};
    if (!name || !deadline) return bad(res, 'Name and deadline are required');

    const task = new Task({
      name,
      description: description || '',
      deadline,
      completed: !!completed,
      assignedUser: assignedUser || '',
      assignedUserName: assignedUserName || (assignedUser ? '' : 'unassigned'),
    });

    const saved = await task.save();

    // Two-way ref: if assigned and not completed, push onto user's pendingTasks
    if (saved.assignedUser && !saved.completed) {
      const user = await User.findById(saved.assignedUser);
      if (user) {
        // Ensure correct name on task if not provided
        if (!saved.assignedUserName || saved.assignedUserName === 'unassigned') {
          saved.assignedUserName = user.name;
          await saved.save();
        }
        if (!user.pendingTasks.includes(saved._id.toString())) {
          user.pendingTasks.push(saved._id.toString());
          await user.save();
        }
      }
    }

    return res.status(201).json({
    message: 'Created',
    data: { _id: saved._id, ...saved.toObject() }
});
  } catch (e) {
    console.error('Error creating task:', e);
    return err(res, 'Error creating task');
  }
});

// GET /api/tasks/:id (supports ?select=)
router.get('/tasks/:id', async (req, res) => {
  try {
    const select = parseJSONParam(req.query.select);
    let q = Task.findById(req.params.id);
    if (select) q = q.select(select);
    const task = await q.exec();
    if (!task) return notFound(res, 'Task not found');
    return ok(res, task);
  } catch (e) {
    return err(res, 'Error fetching task');
  }
});

// PUT /api/tasks/:id (replace)
router.put('/tasks/:id', async (req, res) => {
  try {
    const { name, description, deadline, completed, assignedUser, assignedUserName } = req.body || {};
    if (!name || !deadline) return bad(res, 'Name and deadline are required');

    // Find existing task to reconcile references
    const existing = await Task.findById(req.params.id);
    if (!existing) return notFound(res, 'Task not found');

    const updated = await Task.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description: description ?? '',
        deadline,
        completed: !!completed,
        assignedUser: assignedUser ?? '',
        assignedUserName: assignedUserName ?? (assignedUser ? '' : 'unassigned'),
      },
      { new: true, runValidators: true }
    );

    // Two-way ref reconciliation
    // 1) If assignment changed or completion changed, fix users' pendingTasks
    const prevUserId = existing.assignedUser;
    const newUserId = updated.assignedUser;

    // Remove from previous user's pending if needed
    if (prevUserId && (prevUserId !== newUserId || updated.completed)) {
      await User.updateOne(
        { _id: prevUserId },
        { $pull: { pendingTasks: updated._id.toString() } }
      );
    }
    // Add to new user's pending if assigned and NOT completed
    if (newUserId && !updated.completed) {
      const newUser = await User.findById(newUserId);
      if (newUser) {
        if (updated.assignedUserName === 'unassigned' || !updated.assignedUserName) {
          updated.assignedUserName = newUser.name;
          await updated.save();
        }
        if (!newUser.pendingTasks.includes(updated._id.toString())) {
          newUser.pendingTasks.push(updated._id.toString());
          await newUser.save();
        }
      }
    }

    return ok(res, updated);
  } catch (e) {
    console.error('Error updating task:', e);
    return err(res, 'Error updating task');
  }
});

// DELETE /api/tasks/:id
router.delete('/tasks/:id', async (req, res) => {
  try {
    const deleted = await Task.findByIdAndDelete(req.params.id);
    if (!deleted) return notFound(res, 'Task not found');

    // Two-way ref: remove from assigned user's pendingTasks
    if (deleted.assignedUser) {
      await User.updateOne(
        { _id: deleted.assignedUser },
        { $pull: { pendingTasks: deleted._id.toString() } }
      );
    }
    return ok(res, deleted);
  } catch (e) {
    console.error('Error deleting task:', e);
    return err(res, 'Error deleting task');
  }
});

module.exports = router;
