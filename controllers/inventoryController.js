const InventoryItem = require("../models/InventoryItem");

const getInventory = async (req, res) => {
  try {
    const { category } = req.query;
    const filter = {};
    if (category) filter.category = category;

    const items = await InventoryItem.find(filter)
      .populate("createdBy", "name role")
      .sort({ category: 1, name: 1 });

    const itemsWithLowStockFlag = items.map((item) => {
      const obj = item.toObject();
      obj.isLowStock = obj.currentQuantity <= obj.reorderLevel;
      return obj;
    });

    res.status(200).json({ count: itemsWithLowStockFlag.length, items: itemsWithLowStockFlag });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch inventory items", error: error.message });
  }
};

const getInventoryItemById = async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id).populate("createdBy", "name role");
    if (!item) return res.status(404).json({ message: "Inventory item not found" });

    const obj = item.toObject();
    obj.isLowStock = obj.currentQuantity <= obj.reorderLevel;

    res.status(200).json({ item: obj });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch inventory item", error: error.message });
  }
};

const addInventoryItem = async (req, res) => {
  try {
    const { name, category, unit, currentQuantity, reorderLevel } = req.body;
    if (!name) return res.status(400).json({ message: "Item name is required" });

    const item = await InventoryItem.create({
      name,
      category: category || "feed",
      unit: unit || "kg",
      currentQuantity: currentQuantity !== undefined ? Number(currentQuantity) : 0,
      reorderLevel: reorderLevel !== undefined ? Number(reorderLevel) : 0,
      createdBy: req.user._id,
    });

    res.status(201).json({ message: "Inventory item added", item });
  } catch (error) {
    res.status(500).json({ message: "Failed to add inventory item", error: error.message });
  }
};

const updateInventoryItem = async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Inventory item not found" });

    const { name, category, unit, currentQuantity, reorderLevel } = req.body;
    if (name !== undefined) item.name = name;
    if (category !== undefined) item.category = category;
    if (unit !== undefined) item.unit = unit;
    if (currentQuantity !== undefined) item.currentQuantity = Number(currentQuantity);
    if (reorderLevel !== undefined) item.reorderLevel = Number(reorderLevel);

    await item.save();
    res.status(200).json({ message: "Inventory item updated", item });
  } catch (error) {
    res.status(500).json({ message: "Failed to update inventory item", error: error.message });
  }
};

const deleteInventoryItem = async (req, res) => {
  try {
    const item = await InventoryItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Inventory item not found" });

    res.status(200).json({ message: "Inventory item removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove inventory item", error: error.message });
  }
};

const adjustStock = async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Inventory item not found" });

    const { operation, amount, newQuantity } = req.body;

    if (newQuantity !== undefined) {
      item.currentQuantity = Math.max(0, Number(newQuantity));
    } else if (amount !== undefined) {
      const qtyAmount = Number(amount);
      if (operation === "deduct" || qtyAmount < 0) {
        item.currentQuantity = Math.max(0, item.currentQuantity - Math.abs(qtyAmount));
      } else {
        item.currentQuantity += Math.abs(qtyAmount);
      }
    } else {
      return res.status(400).json({ message: "Please provide amount or newQuantity to adjust stock" });
    }

    await item.save();
    res.status(200).json({ message: "Stock adjusted successfully", item });
  } catch (error) {
    res.status(500).json({ message: "Failed to adjust stock", error: error.message });
  }
};

// Internal helper called by workController.js when completing/resubmitting a task that consumed stock
const deductStockForTask = async (stockItemId, quantityUsed, taskId, userId) => {
  const item = await InventoryItem.findById(stockItemId);
  if (!item) {
    throw new Error("Inventory item not found");
  }

  const used = Number(quantityUsed);
  if (isNaN(used) || used <= 0) {
    throw new Error("Invalid quantity used");
  }

  item.currentQuantity = Math.max(0, item.currentQuantity - used);
  await item.save();
  return item;
};

module.exports = {
  getInventory,
  getInventoryItemById,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  adjustStock,
  deductStockForTask,
};
