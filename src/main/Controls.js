import React from 'react';
import { DATATYPES } from '../datatypes';

// Data-type picker, key input, the three op buttons, the random-fill row
// and the clear button.
export default function Controls({
  datatypeKey,
  onDatatypeChange,
  datatype,
  inputVal,
  setInputVal,
  onInsert,
  onDelete,
  onSearch,
  onRandomFill,
  onClear,
  fillCountInput,
  setFillCountInput,
  fillCount,
  setFillCount,
  fillStartInput,
  setFillStartInput,
  fillStart,
  setFillStart,
  fillEndInput,
  setFillEndInput,
  fillEnd,
  setFillEnd,
  busy,
}) {
  const rangeCfg = datatype.randomRange;
  return (
    <div className="btv-controls">
      <label className="btv-datatype">
        <span className="btv-datatype-label">Type</span>
        <select
          className="btv-select"
          value={datatypeKey}
          onChange={(e) => onDatatypeChange(e.target.value)}
          disabled={busy}
          title="Changing the data type clears the tree"
        >
          {Object.entries(DATATYPES).map(([k, d]) => (
            <option key={k} value={k}>{d.label}</option>
          ))}
        </select>
      </label>

      <input
        className="btv-input"
        type={datatype.inputType}
        step={datatype.inputStep}
        maxLength={datatype.maxLength}
        placeholder={datatype.placeholder}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !busy && onInsert()}
      />

      <button className="btv-btn btv-btn-insert" onClick={onInsert} disabled={busy}>Insert</button>
      <button className="btv-btn btv-btn-delete" onClick={onDelete} disabled={busy}>Delete</button>
      <button className="btv-btn btv-btn-search" onClick={onSearch} disabled={busy}>Search</button>

      <input
        className="btv-input btv-input-fillcount"
        type="number"
        min="1"
        value={fillCountInput}
        style={{ width: `${Math.max(8, fillCountInput.length || 1)}ch` }}
        onChange={(e) => {
          const raw = e.target.value;
          setFillCountInput(raw);
          // Only update the validated numeric value when the field parses;
          // empty / partial input leaves the previous value untouched so a
          // Random Fill click mid-edit still has a sensible target.
          const n = Number.parseInt(raw, 10);
          if (Number.isFinite(n) && n > 0) setFillCount(n);
        }}
        onBlur={() => {
          if (
            fillCountInput.trim() === '' ||
            !Number.isFinite(Number.parseInt(fillCountInput, 10))
          ) {
            setFillCountInput(String(fillCount));
          }
        }}
        disabled={busy}
      />

      {rangeCfg && (
        <RangeFields
          rangeCfg={rangeCfg}
          fillStartInput={fillStartInput}
          setFillStartInput={setFillStartInput}
          fillStart={fillStart}
          setFillStart={setFillStart}
          fillEndInput={fillEndInput}
          setFillEndInput={setFillEndInput}
          fillEnd={fillEnd}
          setFillEnd={setFillEnd}
          datatype={datatype}
          busy={busy}
        />
      )}

      <button className="btv-btn btv-btn-random" onClick={onRandomFill} disabled={busy}>Random Fill</button>
      <button className="btv-btn btv-btn-clear"  onClick={onClear}>Clear</button>
    </div>
  );
}

// Two numeric inputs that drive Random Fill's [start, end] range. Empty
// input maps the validated value to `null`, which useRandomFill treats as
// "use the datatype default" (e.g. 0 for start, 1000 for end on integers).
function RangeFields({
  rangeCfg,
  fillStartInput, setFillStartInput, fillStart, setFillStart,
  fillEndInput, setFillEndInput, fillEnd, setFillEnd,
  datatype, busy,
}) {
  const handleChange = (raw, setInput, setValue) => {
    setInput(raw);
    if (raw.trim() === '') {
      setValue(null);
      return;
    }
    const parsed = rangeCfg.parse(raw);
    if (parsed !== null) setValue(parsed);
  };

  return (
    <span className="btv-range">
      <span className="btv-range-label">Range</span>
      <input
        className="btv-input btv-input-range"
        type={datatype.inputType}
        step={datatype.inputStep}
        value={fillStartInput}
        placeholder={String(rangeCfg.defaultStart)}
        onChange={(e) => handleChange(e.target.value, setFillStartInput, setFillStart)}
        onBlur={() => {
          if (fillStartInput.trim() !== '' && rangeCfg.parse(fillStartInput) === null) {
            setFillStartInput(fillStart === null ? '' : String(fillStart));
          }
        }}
        disabled={busy}
        title="Random Fill range start (inclusive)"
      />
      <span className="btv-range-sep">–</span>
      <input
        className="btv-input btv-input-range"
        type={datatype.inputType}
        step={datatype.inputStep}
        value={fillEndInput}
        placeholder={String(rangeCfg.defaultEnd)}
        onChange={(e) => handleChange(e.target.value, setFillEndInput, setFillEnd)}
        onBlur={() => {
          if (fillEndInput.trim() !== '' && rangeCfg.parse(fillEndInput) === null) {
            setFillEndInput(fillEnd === null ? '' : String(fillEnd));
          }
        }}
        disabled={busy}
        title="Random Fill range end (inclusive)"
      />
    </span>
  );
}
