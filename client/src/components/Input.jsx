import './Input.css';

export const Input = (props) => {
  return (
    <input
      type={props.type}
      value={props.value}
      onChange={props.onChange}
      placeholder={props.placeholder}
      accept={props.accept}
    />
  );
};
