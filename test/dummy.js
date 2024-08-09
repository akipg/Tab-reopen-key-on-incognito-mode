// Create dummy server for testing which can be accesed as http://localhost:3000/<arbital number>, 

// Importing express module
import express from 'express';
// Creating an express app
const app = express();
// Setting up the port number
const port = 3000;

// Creating a get request handler for the root URL
app.get('/', (req, res) => {
    res.send('Hello World!');
});

// Creating a get request handler for the URL with a number
// The number is accessed using req.params.number
app.get('/:number', (req, res) => {
    res.send('You requested for the number: ' + req.params.number);
});

// Starting the server
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
