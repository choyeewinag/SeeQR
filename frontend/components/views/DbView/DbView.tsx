import { IpcMainEvent } from 'electron';
import React, { useState, useEffect } from 'react';
import { Button } from '@material-ui/core';
import { AppState, isDbLists, DatabaseInfo, TableInfo } from '../../../types';
import TablesTabs from './TablesTabBar';
import DatabaseDetails from './DatabaseDetails';
import { once } from '../../../lib/utils';
import DummyDataModal from '../../modal/DummyDataModal';

const { ipcRenderer } = window.require('electron');

// emitting with no payload requests backend to send back a db-lists event with list of dbs
const requestDbListOnce = once(() => ipcRenderer.send('return-db-list'));

interface DbViewProps {
  selectedDb: AppState['selectedDb'];
  show: boolean;
}

const DbView = ({ selectedDb, show }: DbViewProps) => {
  const [dbTables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableInfo>();
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Listen to backend for updates to list of tables on current db
    const tablesFromBackend = (evt: IpcMainEvent, dbLists: unknown) => {
      if (isDbLists(dbLists)) {
        setDatabases(dbLists.databaseList);
        setTables(dbLists.tableList);
        setSelectedTable(selectedTable || dbLists.tableList[0]);
      }
    };
    ipcRenderer.on('db-lists', tablesFromBackend);
    requestDbListOnce();
    // return cleanup function
    return () => ipcRenderer.removeListener('db-lists', tablesFromBackend);
  });

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const db = databases.find((dbN) => dbN.db_name === selectedDb);

  if (!show) return null;
  return (
    <>
      <DatabaseDetails db={db} />
      <br />
      <TablesTabs
        tables={dbTables}
        selectTable={(table: TableInfo) => setSelectedTable(table)}
      />
      <br />
      <br />
      <Button variant="contained" color="primary" onClick={handleClickOpen}>
        Generate Dummy Data
      </Button>
      <DummyDataModal
        open={open}
        onClose={handleClose}
        dbName={db?.db_name}
        tableName={selectedTable?.table_name}
      />
    </>
  );
};

export default DbView;
