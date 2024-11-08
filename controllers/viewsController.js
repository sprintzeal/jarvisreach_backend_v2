


// create a view for customer

import Column from "../models/columnModel.js";
import View from "../models/viewModel.js";

const createNewView = async (req, res, next) => {

    const data = req.body
    // create new view
    const newView = await View.create({
        owner: req.team._id,
        name: data.name,
        template: data.template,
        defaults: data.default,
    });
    // now create column data for this new view
    const newColumns = await Column.create({
        view: newView._id,
        columns: data.columns,
    })
    // add the new column data to the view
    newView.columns = newColumns._id
    await newView.save()
    res.status(200).json({ success: true, result: newView });
    try {

    } catch (error) {
        next(error);
    }

};

// get all views

const getAllViews = async (req, res, next) => {
    try {
        const views = await View.find({ owner: req.team._id });
        res.status(200).json({ success: true, result: views });
    } catch (error) {
        next(error);
    }
};

// get all the column of a view

const getColumnsByView = async (req, res, next) => {

    const viewId = req.params.id;

    try {
        const view = await Column.findOne({ view: viewId });
        res.status(200).json({ success: true, result: view });
    } catch (error) {
        next(error);
    }

};

// delete a view and its columns

const deleteView = async (req, res, next) => {

    const viewId = req.params.id;

    try {
        const view = await View.findByIdAndDelete(viewId);
        if (view) {
            const columns = await Column.findByIdAndDelete(view.columns);
        }
        else {
            throw new Error(`View does not exist`);
        }
        res.status(200).json({ success: true, message: "View Deleted" });
    } catch (error) {
        next(error);
    }

};

// conrtoller for updating a column ("display" filed to true or false) of a view


// const updateView = async (req, res, next) => {
//     const viewId = req.params.id;
//     const { columns } = req.body;
//     try {
//         const view = await Column.findOne({ view: viewId });
//         view.columns = columns;
//         await view.save()
//         res.status(200).json({ success: true, result: view });
//     } catch (error) {
//         next(error);
//     }
// };

const updateView = async (req, res, next) => {
    const viewId = req.params.id;
    const { field, value, columnId } = req.body;

    try {
        const view = await Column.findOne({ view: viewId });
        const newColumns = view.columns.map(c => {
            if (columnId === c._id.toString()) {
                return {
                    ...c.toObject(),
                    [field]: value,
                }
            } else {
                return c.toObject();
            }
            
        })
        view.columns = newColumns
        await view.save()
        res.status(200).json({ success: true, result: view });
    } catch (error) {
        next(error);
    }
};

export {
    createNewView,
    getAllViews,
    getColumnsByView,
    deleteView,
    updateView,
}