import './Button.css';

export const Button = (props) =>{
      return(
        <button onClick={props.onClick} disabled={props.disabled}>{props.text}</button>
    )
}