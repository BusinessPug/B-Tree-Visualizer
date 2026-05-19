import './App.css';
import MainComponent from './main';
import Sudoku from './secretSudoku/Sudoku.jsx';

function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  if (path === '/sudoku' || path.endsWith('/sudoku')) {
    return <Sudoku />;
  }

  return <MainComponent />;
}

export default App;
