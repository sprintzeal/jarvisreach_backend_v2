// convertToXlsxCsv.ts
import * as fs from 'fs';
import * as xlsx from 'xlsx';
import path from 'path';

export const convertToXlsxCsv = (jsonData, fileName, fileType) => {
    // Create a new workbook
    const workbook = xlsx.utils.book_new();

    const __dirname = path.resolve();


    // if the directories doesnot exist, create
    const assetsDir = path.join(__dirname, './assets');
    // Path for the exports folder inside assets
    const exportsDir = path.join(assetsDir, './exports');
    // Ensure the assets directory exists
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir);
    }
    // Ensure the exports directory exists
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir);
    }
    // Final output file path
    const outputFilePath = path.join(exportsDir, `${fileName}.${fileType}`);
    
    let outputFileType;
    // Add the JSON data to a new sheet
    const sheet = xlsx.utils.json_to_sheet(jsonData);

    // Add the sheet to the workbook
    xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet 1');

    // Write the workbook to a file
    if (fileType === 'xlsx') {
        xlsx.writeFile(workbook, outputFilePath);
        outputFileType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    } else if (fileType === 'csv') {
        const csvData = xlsx.utils.sheet_to_csv(sheet);
        fs.writeFileSync(outputFilePath, csvData);
        outputFileType = 'text/csv'
    }

    return {
        filePath: `${process.env.API_BASE_URL}/assets/exports/${fileName}.${fileType}`,
        fileName,
        fileType: outputFileType,
    };
};

export const convertXlsxCsvToJson = (file) => {
    const workbook = xlsx.read(file.buffer, { type: "buffer" });
    //CSV
    // Select the first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert the sheet to JSON
    const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 'A' });

    const columnsNamesObj = jsonData[0];
    const keys = Object.keys(columnsNamesObj);

    // now remove the keys (the first object in the array)
    jsonData.shift();
    const leads = jsonData.map(data => {
        let lead = {};
        for (let key of keys) {
            lead[columnsNamesObj[key]] = data[key];
        };

        return lead;
    })
    return leads
};

