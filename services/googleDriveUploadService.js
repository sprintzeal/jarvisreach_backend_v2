import { google } from 'googleapis';
import { Stream } from 'stream';
import fs from "fs";
// Define the required scope for Google Drive API
const SCOPE = ['https://www.googleapis.com/auth/drive'];


const GOOGLE_SERVICE_ACCOUNT_SECRET = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCcyBhVZRF2l0p5\nnkxJlji5oFP80jTm5iF0+CIZKZKF7y8KWsfDlSjNujAw+rxShS/O/o8qGhGF5K2w\nSgQHJA9n0Yn9i0spBi51WD2EILyIa4es/MRqSrKyE9i/KLoXpbXx/+9zp4mAADdq\njmlm8g7eQB4veCbiN7Ey00UoFa32zgEalgWY5fEHzi4YZyB2WB4Q/jbgHDQr6pNr\nFoOKZ/Z89yBVX2lc+tFqGhwBLmJt563GvtqYPB7wN+/MQV2X4ziOo5GnpHdlxJnX\nyvUGpL+e/3Z3vhVUyZZYn2ZBYbcR2dFsX0RP5YZNjbOevteTDtoFwlRKZDZxrOB9\nztzW4O3zAgMBAAECggEAF4ttLBXbg4XA53bAWiS3LBlJw6QF0c8poxlIdaLqoDaF\nR/bOHS8fS5X0esaM1Y+u2FUeRuJXU1Y+R0U2SaQ+tAahxHPQu75z56dyxY7tAUe0\nvmPPU28YWunkGQESwU5ffpJC8Yltes2NhPESHyWm2fWjEtnmbP6UG9/ieNyYnYGi\nNzh/as+22wMJ4yyL6yFRxFARBiVKNB1JGOrdm15cGLxx76MoK8zXu1Sq0q5geAcu\nRInUrBk5i9zyxa4PIlUcEx+m0MNVpKMrdrYDePgzuXQgYwj5wERelbRmq1bLuFbj\n2jXQ6isBnk1VtosargcnsASunQMm+2D4Vou9dS6ZgQKBgQDK+sV4PPFvzfKasv4X\n2Z57q7xpPfzwgyvRVB2cLsOvnmCYUoDmvBXqx5TXSvMtGnrwwKl8UV/qCAPuPb3H\nblmcLlwV+YK8Uob2ybumu3L6Bvebt5RqRUNpOPdXnDYav2NjtRW5lKzVrK88PDiR\n91HFPaX3Svi/J56uZ8Z3gIPCYQKBgQDFvBHtW4+/N5+fgv/ebkoTcuQhBNoDlWgB\njR12JvHAXT9TNPAZQlgJpB91G/R7BlZcenQ5jRetTz7qBsRifoj52nxkGn1UslrR\nkM32JJpEEXQrGCYBl8Q3XrvDiEKTqC3NCyfAGzQ4vF0jr0micCYET+40EH00oqZr\nUqLmo9K40wKBgE6AQdLIrw9wdP1DcGXE8jgeKRYCtUpHULD6eSEoLOJEvFLsxZF2\n+Hr+iR/iir3M2fM2b9X2msOmKe7/zd/NW7a9bzvIbblrqWrUhlBreoIcI7MDgtC+\nzN1q/K3TalFZ55RuOmK1j0psKLGBENfS8Lr5prBHPIChUAtfczBQcaTBAoGBAKlG\nH3K694wS6it70d9xOyj7KiC6Lojy1l69l4MWQ88SBKwOnZyCFyvpvKRckibfff8d\nNXIvPx22wX1G3cgT2t9KE0L/Clv/c5AEDs2w9/9dkb1yptamPevIxaTWeWg+iTcH\nXbgvkb0gQ/vQi5DrwR/f7WPU2dq9gwpNa/dWN4bRAoGAb8mtUhAdRcMcdOED9Mp1\nffw2fOCe0hiOdFOxuEg8WUqwaI8YduIUDKPWPUOp+5aCTsKLR5HdB/SyvVSyLftp\nXuaHiujyrcNBU0QIhHiC1NffcJXYONIvzrY8jeMj83kOBB8hlxJXGF0TPtGdqsOi\nFLCNbFJEJFycMv2reZTXLqY=\n-----END PRIVATE KEY-----"


// Function to authorize with Google Drive API using a service account
async function authorize() {
    const jwtClient = new google.auth.JWT(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        GOOGLE_SERVICE_ACCOUNT_SECRET,
        SCOPE
    );

    try {
        await jwtClient.authorize();
        return jwtClient;
    } catch (error) {
        throw new Error(`Authorization failed: ${error.message}`);
    }
}

// Function to upload a file to a specific Google Drive folder
async function uploadFile(authClient, fileToUpload) {

    const drive = google.drive({ version: 'v3', auth: authClient });
    let fileData

    if (fileToUpload.buffer) {
        // the file from api
        fileData = new Stream.PassThrough().end(fileToUpload.buffer)
    } else{
        // to upload from local system
        fileData = fs.createReadStream(fileToUpload.path)
    }
    const fileMetaData = {
        name: fileToUpload.originalname,
        parents: ['1zoKs2AlwsC4yxCKWU5l0X9KKAiuVFY-4'] // Replace with your folder ID
    };

    try {
        const response = await drive.files.create({
            requestBody: fileMetaData,
            media: {
                mimeType: fileToUpload.mimeType,
                body: fileData, // files that will get uploaded
            },
            fields: 'id'
        });

        // Retrieve the file's public URL
        const file = await drive.files.get({
            fileId: response.data.id,
            fields: 'webViewLink, webContentLink'
        });

        return {
            publicUrl: file.data.webViewLink || file.data.webContentLink
        };
    } catch (error) {
        throw new Error(`File upload failed: ${error.message}`);
    }
}

// Main function to handle file upload to Google Drive
export const uploadToGoogleDrive = async (file) => {
    try {
        const auth = await authorize();
        const uploadedFile = await uploadFile(auth, file);

        return uploadedFile;
    } catch (error) {
        throw new Error(error.message);
    }
};
