import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import compression from "compression";
import multer from "multer";
import fs from "fs";
import csvParser from "csv-parser";
import dotenv from "dotenv";
import { Products, Packs } from "./db/models.js";

dotenv.config({
  path: ".env",
});

const PORT = process.env.PORT || 3001;
const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});

app.post("/api/validation", upload.any(), async (req, res) => {
  const arq = req.files?.[0];
  console.log("oi");
  if (!arq || arq.mimetype !== "text/csv") {
    res.status(400);
    res.setHeader("Content-Type", "application/json");
    res.json({
      message: "Arquivo inválido",
    });
    return;
  }

  const file = [];
  let headersFile = [];
  let response = [];

  fs.createReadStream(arq.path, "utf8", function (err) {
    if (err) throw err;
  })
    .pipe(csvParser())
    .on("data", (d) => {
      file.push({
        product_code: d.product_code,
        new_price: d.new_price,
      });
    })
    .on("headers", (headers) => {
      headersFile = headers;
    })
    .on("end", async () => {
      if (headersFile.toString() !== "product_code,new_price" || !file.length) {
        res.status(400);
        res.setHeader("Content-Type", "application/json");
        res.json({
          message: "Arquivo inválido",
        });
        return;
      }

      response = [];
      //VALIDAÇÃO CAMPOS
      for (let i = 0; i < file.length; i++) {
        const dado = file[i];
        let resp = { ...dado, status: [] };
        let error = false;
        if (!dado.product_code) {
          error = true;
          resp = {
            ...resp,
            status: [
              ...resp.status,
              { message: "Campo product_code não preenchido", type: "error" },
            ],
          };
        } else if (isNaN(dado.product_code)) {
          error = true;
          resp = {
            ...resp,
            status: [
              ...resp.status,
              { message: "Campo product_code não é um número", type: "error" },
            ],
          };
        }

        if (!dado.new_price) {
          error = true;
          resp = {
            ...resp,
            status: [
              ...resp.status,
              { message: "Campo new_price não preenchido", type: "error" },
            ],
          };
        } else if (isNaN(dado.new_price)) {
          error = true;
          resp = {
            ...resp,
            status: [
              ...resp.status,
              { message: "Campo new_price não é um número", type: "error" },
            ],
          };
        }

        if (!error) {
          //VERIFICA SE EXISTE NO BANCO
          const productDb = await Products.findOne({
            attributes: ["code", "name", "cost_price", "sales_price"],
            where: {
              code: Number(dado.product_code),
            },
          });

          if (!productDb) {
            error = true;
            resp = {
              ...resp,
              status: [
                ...resp.status,
                { message: "Produto não encontrado", type: "error" },
              ],
            };
          }else{
            resp = {
              ...resp,
              ...productDb.dataValues
            };
          }

          if (!error) {
            //REGRAS CENARIO
            //CENARIO 2 - FINANCEIRO
            if (dado.cost_price < dado.new_price) {
              resp = {
                ...resp,
                status: [
                  ...resp.status,
                  {
                    message: "Preço de custo maior que o novo preço",
                    type: "error",
                    cenario: 2,
                  },
                ],
              };
            }

            //CENARIO 3 - MARKETING
            if (
              Number(dado.new_price) <
              Number(productDb.dataValues.sales_price) * 0.9
            ) {
              resp = {
                ...resp,
                status: [
                  ...resp.status,
                  {
                    message:
                      "Novo preço segere decrescimento acima do limite de dez por cento de ajuste",
                    type: "error",
                    cenario: 3,
                  },
                ],
              };
            } else if (
              Number(dado.new_price) >
              Number(productDb.dataValues.sales_price) * 1.1
            ) {
              resp = {
                ...resp,
                status: [
                  ...resp.status,
                  {
                    message:
                      "Novo preço segere crescimento acima do limite de dez por cento de ajuste",
                    type: "error",
                    cenario: 3,
                  },
                ],
              };
            }

            //OLHAR OS FIND (FILTER)
            //CENARIO 4 - PACOTES
            const packsDb = await Packs.findAll({
              attributes: ["product_id", "qty"],
              where: {
                pack_id: Number(dado.product_code),
              },
            });

            if (!packsDb.length) {
              const idsPack = await Packs.findAll({
                attributes: ["pack_id"],
                where: {
                  product_id: Number(dado.product_code),
                },
              });

              if (idsPack.length) {
                //4.2 - PRODUTO É ITEM PACK (dado.product_code incluido no PACK)
                /*
                  Se produto pode fazer parte de um pack
                    Acha linha do pack no csv
                    Pegar preço modificado no pack e construir o valor do item indiviadual
                  Se não faz parte do pack não verifica nada
                */
                const ids = idsPack.map((it) =>
                  it.dataValues.pack_id.toString()
                );
                const packCsv = file.filter((it) =>
                  ids.includes(it.product_code)
                );

                if (packCsv.length) {
                  for (let pack of packCsv) {
                    const packsDb = await Packs.findAll({
                      attributes: ["product_id", "qty"],
                      where: {
                        pack_id: Number(pack.product_code),
                      },
                    });

                    const itensPackCsv = [];
                    for (let item of packsDb) {
                      const itemPack = file.find((it) => {
                        return (
                          it.product_code ===
                          item.dataValues.product_id.toString()
                        );
                      });
                      if (itemPack) {
                        itensPackCsv.push(itemPack);
                      }
                    }
                    if (itensPackCsv.length == 0) {
                      resp = {
                        ...resp,
                        status: [
                          ...resp.status,
                          {
                            message: "Item - Produtos do pack não estão no CSV",
                            type: "error",
                            cenario: 4,
                          },
                        ],
                      };
                    } else if (itensPackCsv.length < packsDb.length) {
                      //APENAS ALGUNS PRODUTOS DO PACK ESTÁ NO CSV
                      const idsCsv = itensPackCsv.map((it) => it.product_code);
                      const idsFalta = packsDb.filter(
                        (it) => !idsCsv.includes(it.product_id)
                      );

                      const produtosFaltaCsv = await Products.findAll({
                        attributes: ["code", "sales_price"],
                        where: {
                          code: idsFalta.map((it) => it.product_id),
                        },
                      });

                      let soma = itensPackCsv.reduce((acc, cur) => {
                        const qtd = packsDb.find(
                          (it) => it.product_id.toString() === cur.product_code
                        ).qty;
                        return acc + Number(cur.new_price) * (qtd || 1);
                      }, 0);

                      soma = produtosFaltaCsv.reduce((acc, cur) => {
                        const qtd = packsDb.find(
                          (it) => it.product_id === cur.code
                        ).qty;
                        return acc + Number(cur.sales_price) * (qtd || 1);
                      }, soma);

                      if (soma !== Number(pack.new_price)) {
                        resp = {
                          ...resp,
                          status: [
                            ...resp.status,
                            {
                              message:
                                "Item - Preço do pack não corresponde ao preço dos produtos no csv (1)",
                              type: "error",
                              cenario: 4,
                            },
                          ],
                        };
                      }
                    } else if (itensPackCsv.length === packsDb.length) {
                      const soma = itensPackCsv.reduce((acc, cur) => {
                        const qtd = packsDb.find(
                          (it) => it.product_id.toString() === cur.product_code
                        ).qty;
                        return acc + Number(cur.new_price) * (qtd || 1);
                      }, 0);

                      if (soma !== Number(pack.new_price)) {
                        resp = {
                          ...resp,
                          status: [
                            ...resp.status,
                            {
                              message:
                                "Item - Preço do pack não corresponde ao preço dos produtos no csv (2)",
                              type: "error",
                              cenario: 4,
                            },
                          ],
                        };
                      }
                    } else {
                      resp = {
                        ...resp,
                        status: [
                          ...resp.status,
                          {
                            message:
                              "Item - Total de produtos do pack no csv é maior que total de produtos no pack",
                            type: "error",
                            cenario: 4,
                          },
                        ],
                      };
                    }
                  }
                } else {
                  resp = {
                    ...resp,
                    status: [
                      ...resp.status,
                      {
                        message:
                          "Item - Pack(s) que o produto compõe não está no CSV",
                        type: "error",
                        cenario: 4,
                      },
                    ],
                  };
                }
              }
              //NÃO É ITEM DE PACK
            } else {
              //4.1 - PRODUTO É PACK (dado.product_code == 'PACK')
              /*
              Se produto é um pack
              Acha linha dos itens individuais no csv
              Pegar preço modificado e construir o pack para verificar o valor
            */
              //PRODUTO É PACK
              const itensPackCsv = [];
              for (let item of packsDb) {
                const itemPack = file.find((it) => {
                  return (
                    it.product_code === item.dataValues.product_id.toString()
                  );
                });

                if (itemPack) {
                  itensPackCsv.push(itemPack);
                }
              }

              if (itensPackCsv.length == 0) {
                resp = {
                  ...resp,
                  status: [
                    ...resp.status,
                    {
                      message: "Produtos do pack não estão no CSV",
                      type: "error",
                      cenario: 4,
                    },
                  ],
                };
              } else if (itensPackCsv.length < packsDb.length) {
                //APENAS ALGUNS PRODUTOS DO PACK ESTÁ NO CSV
                const idsCsv = itensPackCsv.map((it) => it.product_code);
                const idsFalta = packsDb.filter(
                  (it) => !idsCsv.includes(it.product_id)
                );

                const produtosFaltaCsv = await Products.findAll({
                  attributes: ["code", "sales_price"],
                  where: {
                    code: idsFalta.map((it) => it.product_id),
                  },
                });

                let soma = itensPackCsv.reduce((acc, cur) => {
                  const qtd = packsDb.find(
                    (it) => it.product_id.toString() === cur.product_code
                  ).qty;
                  return acc + Number(cur.new_price) * (qtd || 1);
                }, 0);

                soma = produtosFaltaCsv.reduce((acc, cur) => {
                  const qtd = packsDb.find(
                    (it) => it.product_id === cur.code
                  ).qty;
                  return acc + Number(cur.sales_price) * (qtd || 1);
                }, soma);

                if (soma !== Number(dado.new_price)) {
                  resp = {
                    ...resp,
                    status: [
                      ...resp.status,
                      {
                        message:
                          "Preço do pack não corresponde ao preço dos produtos no csv (1)",
                        type: "error",
                        cenario: 4,
                      },
                    ],
                  };
                }
              } else if (itensPackCsv.length === packsDb.length) {
                const soma = itensPackCsv.reduce((acc, cur) => {
                  const qtd = packsDb.find(
                    (it) => it.product_id.toString() === cur.product_code
                  ).qty;
                  return acc + Number(cur.new_price) * (qtd || 1);
                }, 0);

                if (soma !== Number(dado.new_price)) {
                  resp = {
                    ...resp,
                    status: [
                      ...resp.status,
                      {
                        message:
                          "Preço do pack não corresponde ao preço dos produtos no csv (2)",
                        type: "error",
                        cenario: 4,
                      },
                    ],
                  };
                }
              } else {
                resp = {
                  ...resp,
                  status: [
                    ...resp.status,
                    {
                      message:
                        "Total de produtos do pack no csv é maior que total de produtos no pack",
                      type: "error",
                      cenario: 4,
                    },
                  ],
                };
              }
            }
          }
        }

        response.push(resp);
      }

      res.status(200);
      res.setHeader("Content-Type", "application/json");
      res.json({
        message: "ok",
        response,
      });
    });
});

app.post("/api/update_prices",upload.any(), async (req, res) => {
  try {
    let itens = req.body.itens;
    let response = [];
    if(!itens){
      res.status(400);
      res.setHeader("Content-Type", "application/json");
      res.json({
        message: "Erro ao atualizar preçoo",
      });
      return;
    }
    
    for (let item of itens) {
      response.push({
        ...item,
        status: [],
      });

      await Products.update(
        {
          sales_price: Number(item.new_price),
        },
        {
          where: {
            code: Number(item.product_code),
          },
        }
      ).catch((err) => {
        console.log(err);
        response[response.length - 1].status.push({
          message: "Erro ao atualizar preço",
          type: "error",
        });
      });
    }

    //CADASTRAR NO BANCO
    res.status(200);
    res.setHeader("Content-Type", "application/json");
    res.json({
      message: "ok",
      response,
    });
  } catch (e) {
    console.log(e);
    res.status(400);
    res.setHeader("Content-Type", "application/json");
    res.json({
      message: "Erro ao atualizar preço",
    });
  }
});
