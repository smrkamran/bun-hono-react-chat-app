import { useMutation } from "@tanstack/react-query";
import { client, queryClient } from "../client";
import { useSenderSession } from "../use-sender-session";
import { ChatMessage } from "@org/api-contract";
import { UseMessagesQueryFnResult, UseMessagesQueryKey } from "./use-messages-query";
import { create } from "mutative";

export function useSendMessageMutation() {
  return useMutation({
    mutationKey: ["send-message"],
    mutationFn(variables: { message: string }) {
      return client.chat.$post({
        json: {
          as: useSenderSession.getState().as,
          content: variables.message,
          createdAt: new Date().toISOString(),
        },
      });
    },
    onMutate(variables: { message: string }) {
      const optimisticMessage = {
        id: `optimistic-${Math.random()}`,
        as: useSenderSession.getState().as,
        content: variables.message,
        createdAt: new Date().toISOString(),
        readAt: null,
      } satisfies ChatMessage;
      const messagesQueryKey = ["chat"] satisfies UseMessagesQueryKey;
      queryClient.setQueryData<UseMessagesQueryFnResult>(messagesQueryKey, (cachedData) => {
        if (cachedData === undefined) return [optimisticMessage];
        return create(cachedData, (draft) => {
          draft.push(optimisticMessage);
        });
      });

      return { optimisticMessage };
    },
    async onSuccess(newMessageResponse, _variables, { optimisticMessage }) {
      const newMessage = await newMessageResponse.json();
      const messagesQueryKey = ["chat"] satisfies UseMessagesQueryKey;
      queryClient.setQueryData<UseMessagesQueryFnResult>(messagesQueryKey, (cachedData) => {
        if (cachedData === undefined || cachedData === null) return [newMessage];

        return create(cachedData, (draft) => {
          const optimisticMessageIdx = draft.findIndex((message) => message.id === optimisticMessage.id);
          draft[optimisticMessageIdx] = newMessage;
        });
      });
    },
    onError(_err, _variables, context) {
      if (context === undefined) return;
      const messagesQueryKey = ["chat"] satisfies UseMessagesQueryKey;
      queryClient.setQueryData<UseMessagesQueryFnResult>(messagesQueryKey, (cachedData) => {
        if (cachedData === undefined || cachedData === null) return [];
        return create(cachedData, (draft) => {
          const optimisticMessageIdx = draft.findIndex((message) => message.id === context.optimisticMessage.id);
          draft.splice(optimisticMessageIdx, 1);
        });
      });
    },
  });
}
