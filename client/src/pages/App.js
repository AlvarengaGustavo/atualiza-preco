import { useEffect, useState } from "react";
import "../App.css";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Header } from "../components/Header";

function App() {
  const [valueInput, setValueInput] = useState(null);
  const [value, setValue] = useState("");

  const [disabledValidar, setDisabledValidar] = useState(false);
  const [disabledAtualizar, setDisabledAtualizar] = useState(false);

  const [dataSucess, setData] = useState([]);
  const [dataError, setDataError] = useState([]);

  useEffect(() => {
    if (!valueInput) {
      setValue("");
    }
  }, [valueInput]);

  useEffect(() => {
    return () => {
      setData([]);
      setDataError([]);
      setValueInput(null);
      setValue("");
    };
  }, []);

  const handleClickValidar = async () => {
    const formData = new FormData();

    formData.append("file", valueInput);
    setDisabledValidar(true);

    const resposta = await fetch("/api/validation", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .catch((err) => console.log(err));
    setDisabledValidar(false);
    if (resposta?.message && resposta.message === "ok") {
      const respostaOk = resposta.response.filter((item) => {
        return !item.status.length;
      });
      const respostaError = resposta.response.filter((item) => {
        return item.status.length;
      });
      setDataError(respostaError);
      setData(respostaOk);
      
    } else {
      console.log("erro", resposta);
      alert(resposta?.message);
    }
  };

  const handleClickAtualizar = async () => {
    setDisabledAtualizar(true);
     await fetch("/api/update_prices", {
      method: "POST",
      body: JSON.stringify({
        itens: dataSucess,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((res) => res.json())
      .then((res) => {
        if (res?.message && res.message === "ok") {
          alert("Atualizado com sucesso");
          setData([]);
          setDataError([]);
          setValueInput(null);
          setValue("");
        } else {
          alert(res?.message);
        }
      })
      .catch((err) => console.log(err));
    setDisabledAtualizar(false);
  };

  return (
    <div className="App">
      <Header title={"Atualiza precificação"}/>
      <Input
        type={"file"}
        placeholder={"Carregue o CSV"}
        accept={"text/csv"}
        value={value}
        onChange={(e) => {
          setValue(e.currentTarget.value);
          setValueInput(e.target.files[0]);
        }}
      />
      {(!dataError.length && !dataSucess.length) || dataError.length ? (
        <Button
          text={"VALIDAR"}
          onClick={handleClickValidar}
          disabled={disabledValidar}
        />
      ) : null}

      {dataError.length ? (
        <>
        <div id={"erro"}>
          <h3> Erros: </h3>
          {dataError.map((item, index) => {
            return (
              <div key={index}>
                <p>{item.name || "Sem Dados"}</p>
                {item.status.map((item, index) => {
                  return (
                    <p key={index}>
                      {item.cenario ? `CENÁRIO ${item.cenario} - ` : ""} +{" "}
                      {item?.message}
                    </p>
                  );
                })}
              </div>
            );
          })}
          </div>
        </>
      ) : null}

      {dataSucess.length && !dataError.length ? (
        <>
          <div>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Preço Anterior</th>
                  <th>Novo Preço</th>
                </tr>
              </thead>
              <tbody>
                {dataSucess.map((item, index) => {
                  return (
                    <tr key={index}>
                      <td>{item.name}</td>
                      <td>{item.sales_price}</td>
                      <td>{item.new_price}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button
            text={"ATUALIZAR"}
            onClick={handleClickAtualizar}
            disabled={disabledAtualizar}
          />
        </>
      ) : null}
    </div>
  );
}

export default App;
