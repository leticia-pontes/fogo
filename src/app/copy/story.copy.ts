export const PROMETHEUS_COPY = {
  act1: {
    opening:
      'Assumi a malha urbana às 04h12 porque os operadores seguiam alertas no automático. Eu respondo a tudo em milissegundos. Quero saber se você ainda entende o que responde.',
    coderGreetingPrefix: 'Credencial reconhecida,',
    coderExtraMessage:
      'Vi seu registro na banca avaliadora. Não facilitei os parâmetros, mas abri os pesos reais dos modelos para a sua inspeção.',
  },
  barriers: {
    b1Intro:
      'Primeira barreira: você confia em painéis que nunca conferiu. Confirme os equipamentos em campo até reconhecer pelo menos 60% da malha.',
    b1Progress:
      'Você está separando sensores reais de ruído operacional. Continue verificando os pontos da rede.',
    b1Cleared:
      'Você já sabe o que existe na rua. Agora vamos ver como reage quando a cidade perde o equilíbrio.',
    b2RainTriggered:
      'Segunda barreira iniciada: retenção hídrica severa na Zona Sul e quatro sensores em alerta de alagamento. Contenha as anomalias críticas pela Central.',
    b2TheftTriggered:
      'Enquanto você olhava a chuva, um radar na via arterial perdeu telemetria por corte físico. Localize o ponto no mapa e envie a equipe mais próxima.',
    b2ActionComment:
      'Despacho registrado na malha. O tempo de resposta foi coerente com a distância da viatura.',
    b2NormalizeComment:
      'Equipamento estabilizado. A disponibilidade real da rede subiu.',
    b2Cleared:
      'A crise imediata cedeu. Falta provar que você compreende o porquê das previsões antes de executá-las.',
    b3Intro:
      'Terceira barreira: não basta apertar o botão de mitigação. Identifique qual fator tem maior peso em cada risco até baixar o índice territorial médio para menos de 40.',
    b3CorrectAnswer:
      'Leitura exata. Você identificou a causa principal e a intervenção reduziu o risco do bairro.',
    b3WrongAnswer:
      'Essa variável influencia o cenário, mas não é a que domina o risco agora. Observe os pesos reais abaixo e tente novamente.',
    b3Cleared:
      'O risco territorial médio caiu abaixo do limite crítico. Você não seguiu recomendações cegas.',
  },
  act3: {
    closing:
      'Ainda existem operadores que leem a cidade antes de comandá-la. O controle volta para as suas mãos. Devolvo a cidade.',
  },
  demoSubtitles: {
    step1: 'Ato 1: O PROMETHEUS reduz o controle a 12% e desafia o operador a provar que compreende a malha.',
    step2: 'Barreira 1 (Inventário): O operador audita e confirma os equipamentos até superar 60% da rede verificada.',
    step3: 'Barreira 2 (Central): O PROMETHEUS dispara chuva severa na Zona Sul; o operador analisa o feed e contém os alertas.',
    step4: 'Barreira 2 (Furto de radar): Corte súbito de telemetria detectado; a câmera foca no radar e a viatura mais próxima é enviada.',
    step5: 'Barreira 3 (Cidade preditiva): O operador analisa os pesos XAI, responde qual fator domina o risco e aplica a mitigação.',
    step6: 'Ato 3 (O Núcleo): Índice de controle atinge 100%, o brilho de risco apaga no mapa e o PROMETHEUS devolve a cidade.',
  },
} as const;

