import faker from "faker";
import execute from "../channels";
const db = require('../models');

/////////////////////////////////////////////////////////////////////
/*   THIS FILE CONTAINS THE ALGORITHMS THAT GENERATE DUMMY DATA    */
/*                                                                 */
/* - The functions below are called in channels.ts                 */
/* - This process runs for each table where data is requested      */
/* - generateDummyData creates dummy data values in a table matrix */
/* - This matrix is passed to writeCSV file, which writes a        */
/*   file to the postgres-1 container                              */
/////////////////////////////////////////////////////////////////////

let keyObject: any;

//this object is generated by a method in models.ts
type schemaLayout = {
  tableNames: string[];
  tables: any;
}

//this object is created on the front end in DummyDataModal
type dummyDataRequest = {
  schemaName: string;
  dummyData: {};
}

//this function generates unique values for a column
const generatePrimayKey = () => {

}

// this function generates non-unique data for a column
//   dataType should be an object
//   ex: {
//     'data_type': 'integer';
//     'character_maximum_length': null
//   }
const generateDataByType = (columnObj) => {
  //faker.js method to generate data by type
  switch (columnObj.dataInfo.data_type) {
    case 'smallint':
      return faker.random.number({min: -32768, max: 32767});
    case 'integer':
      return faker.random.number({min: -2147483648, max: 2147483647});
    case 'bigint':
      return faker.random.number({min: -9223372036854775808, max: 9223372036854775807});
    case 'character varying':
      if (columnObj.dataInfo.character_maximum_length) {
        return faker.lorem.character(Math.floor(Math.random() * columnObj.dataInfo.character_maximum_length));
      }
      else return faker.lorem.word();
    case 'date':
      let result: string = '';
      let year: string = getRandomInt(1500, 2020).toString();
      let month: string = getRandomInt(1, 13).toString();
      if (month.length === 1) month = '0' + month;
      let day: string = getRandomInt(1, 29).toString();
      if (day.length === 1) day = '0' + day;
      result += year + '-' + month + '-' + day;
      return result;
    default:
      console.log('error')
  }
};

//helper function to generate random numbers that will ultimately represent a random date
const getRandomInt = (min, max) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
}

let count: number = 0;

module.exports = {

  writeCSVFile: (tableMatrix, tableName, columnArray, schemaName, keyObject, tableCount, dummyDataRequest, event: any) => {
    let check: boolean = false;
    console.log('in CSV file');
    const table: any = [];
    let row: any  = [];
    for(let i = 0; i < tableMatrix[0].length; i++) {
      for(let j = 0; j < tableMatrix.length; j++) {
          row.push(tableMatrix[j][i]); 
      }
      //join each subarray (which correspond to rows in our table) with a comma
      const rowString = row.join(',');
      table.push(rowString); //'1, luke, etc'
      row = [];
    }
    
    // Step 3 - this step adds back the PK constraints that we took off prior to copying the dummy data into the DB (using the db that is imported from models.ts)
    const step3 = () => {
      count += 1;
      let checkLast: number = tableCount - count;
      console.log('CHECK LAST: ', checkLast);
      if (checkLast === 0) {
        db.addPrimaryKeyConstraints(keyObject, dummyDataRequest)
          .then(() => {
            db.addForeignKeyConstraints(keyObject, dummyDataRequest)
            .then(() => {
              console.log('CONSTRAINTS ADDED BACK');
              event.sender.send('async-complete');
              count = 0;
            })
            .catch((err) => {
              console.log(err);
              count = 0;
            });
          })
          .catch((err) => {
            console.log(err);
            count = 0;
          });
      }
      else return;
    } 

    // Step 2 - using the postgres COPY command, this step copies the contents of the csv file in the container file system into the appropriate postgres DB
    const step2 = () => {
      let queryString: string = `COPY ${tableName} FROM '/${tableName}.csv' WITH CSV HEADER;`;
      // run the query in the container using a docker command
      execute(`docker exec postgres-1 psql -U postgres -d ${schemaName} -c "${queryString}" `, step3);
    }

    let csvString: string;
    //join tableMatrix with a line break (different on mac and windows because of line breaks in the bash CLI)
    if (process.platform === 'win32') {
      const tableDataString: string = table.join(`' >> ${tableName}.csv; echo '`);
      const columnString: string = columnArray.join(',');
      csvString = columnString.concat(`' > ${tableName}.csv; echo '`).concat(tableDataString);
    }
    else {
      const tableDataString: string = table.join('\n');
      const columnString: string = columnArray.join(',');
      csvString = columnString.concat('\n').concat(tableDataString);
    }

    console.log(csvString.length);

    // split csv string into an array of csv strings that each are of length 175,000 characters or less

    // create upperLimit variable, which represents that max amount of character a bash shell command can handle
    const upperLimit: number = 100000;
    // create stringCount variable that is equal to csvString divided by upper limit rounded up
    let stringCount: number = Math.ceil(csvString.length / upperLimit);
    // create csvArray that will hold our final csv strings
    let csvArray: string[] = [];

    let startIndex: number;
    let endIndex: number;
    // iterate over i from 0 to less than stringCount, each iteration pushing slices of original csvString into an array
    for (let i = 0; i < stringCount; i += 1) {
      startIndex = upperLimit * i;
      endIndex = startIndex + upperLimit;
      // if on final iteration, only give startIndex to slice operator to grab characters until the end of csvString
      if (i === stringCount - 1) csvArray.push(csvString.slice(startIndex));
      else csvArray.push(csvString.slice(startIndex, endIndex));
    }

    console.log(csvArray);

    // Step 1 - this writes a csv file to the postgres-1 file system, which contains all of the dummy data that will be copied into its corresponding postgres DB


    let index: number = 0

    const step1 = () => {
      // console.log('in the RECURSIVE function: ', index);
      // NOTE: in order to rewrite the csv files in the container file system, we must use echo with a single angle bracket on the first element of csvArray AND then move on directly to step2 (and then also reset index)

      // if our csvArray contains only one element
      if (csvArray.length === 1) {
        execute(`docker exec postgres-1 bash -c "echo '${csvArray[index]}' > ${tableName}.csv;"`, step2);
        index = 0;
      }
      // otherwise if we are working with the first element in csvArray
      else if (index === 0) {
        execute(`docker exec postgres-1 bash -c "echo -n '${csvArray[index]}' > ${tableName}.csv;"`, step1);
        index += 1;
      }
      // if working with last csvArray element, execute docker command but pass in step2 as second argument
      else if (index === (csvArray.length - 1)) {
        // console.log('FINAL STEP 1: ', csvArray[index]);
        execute(`docker exec postgres-1 bash -c "echo '${csvArray[index]}' >> ${tableName}.csv;"`, step2);
        index = 0;
      }
      // otherwise we know we are not working with the first OR the last element in csvArray, so execute docker command but pass in a recursive call to our step one function and then immediately increment our index variable
      else {
        // console.log('STEP 1: ', index, csvArray[index]);
        execute(`docker exec postgres-1 bash -c "echo -n '${csvArray[index]}' >> ${tableName}.csv;"`, step1);
        index += 1;
      }
    }
  
    step1();

  },


  //maps table names from schemaLayout to sql files
  generateDummyData: (schemaLayout, dummyDataRequest, keyObject) => {
    console.log('in DD gen func');
    const returnArray: any = [];
  
    //iterate over schemaLayout.tableNames array
    for (const tableName of schemaLayout.tableNames) {
      const tableMatrix: any = [];
      //if matching key exists in dummyDataRequest.dummyData
      if (dummyDataRequest.dummyData[tableName]) {
        //declare empty columnData array for tableMatrix
        let columnData: any = [];
        //declare an entry variable to capture the entry we will push to column data
        let entry: any;

        //iterate over columnArray (i.e. an array of the column names for the table)
        let columnArray: string[] = schemaLayout.tables[tableName].map(columnObj => columnObj.columnName)
        for (let i = 0; i < columnArray.length; i++) {
          // declare a variable j (to be used in while loops below), set equal to zero
          let j: number = 0;
          // if this is a PK column, add numbers into column 0 to n-1 (ordered)
          if (keyObject[tableName].primaryKeyColumns[columnArray[i]]) {
            //while i < reqeusted number of rows
            while (j < dummyDataRequest.dummyData[tableName]) {
              //push into columnData
              columnData.push(j);
              // increment j
              j += 1;
            } 
          }

          // if this is a FK column, add random number between 0 and n-1 (inclusive) into column (unordered)
          else if (keyObject[tableName].foreignKeyColumns[columnArray[i]]) {
            //while j < reqeusted number of rows
            while (j < dummyDataRequest.dummyData[tableName]) {
              //generate an entry
              entry = Math.floor(Math.random() * (dummyDataRequest.dummyData[tableName]));
              //push into columnData
              columnData.push(entry);
              j += 1;
            }
          }
          
          // otherwise, we'll just add data by the type to which the column is constrained
          else {
            while (j < dummyDataRequest.dummyData[tableName]) {
              //generate an entry
              entry = generateDataByType(schemaLayout.tables[tableName][i]);
              //push into columnData
              columnData.push(entry);
              j += 1;
            };
          }

          //push columnData array into tableMatrix
          tableMatrix.push(columnData);
          //reset columnData array for next column
          columnData = [];
        };
        // only push something to the array if data was asked for for the specific table
        returnArray.push({tableName, data: tableMatrix});
      };
    };
    // then return the returnArray
    return returnArray;
  }
}